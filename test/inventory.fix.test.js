const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');
const store = require('../lib/store');

function fixtureTest(name, run) {
  test(name, { concurrency: false }, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopledger-fix-'));
    const previousPath = process.env.SHOPLEDGER_DB_PATH;
    t.after(() => {
      if (previousPath === undefined) delete process.env.SHOPLEDGER_DB_PATH;
      else process.env.SHOPLEDGER_DB_PATH = previousPath;
      fs.rmSync(dir, { recursive: true, force: true });
    });
    process.env.SHOPLEDGER_DB_PATH = path.join(dir, 'db.json');
    fs.copyFileSync(path.join(__dirname, '../data/db.json'), process.env.SHOPLEDGER_DB_PATH);
    run(store.read());
  });
}

for (const sku of ['DRY-001', 'SPC-001']) {
  fixtureTest('issue #2: can sell the last sellable unit of ' + sku, (db) => {
    const product = db.products.find((p) => p.sku === sku);
    const reserved = product.reserved;
    assert.equal(inventory.getSellableStock(product), 1);
    const items = [{ id: product.id, qty: 1 }];
    assert.deepEqual(inventory.check(db.products, items), { ok: true });
    inventory.reserve(db.products, items);
    assert.equal(product.stock, reserved);
    assert.equal(product.reserved, reserved);
    assert.equal(inventory.getSellableStock(product), 0);
    assert.equal(inventory.check(db.products, items).ok, false);
  });
}

fixtureTest('issue #2: cancelling pending order #1007 restores every line exactly once', (db) => {
  const before = structuredClone(db.products);
  const order = orders.get(db, 1007);
  assert.equal(order.status, 'pending');
  assert.deepEqual(order.items.map((item) => [item.id, item.qty]), [[6, 2], [4, 2]]);
  assert.equal(orders.cancel(db, 1007, 'Stock restoration test').ok, true);

  for (const original of before) {
    const product = inventory.find(db.products, original.id);
    const returned = order.items.filter((item) => item.id === original.id)
      .reduce((sum, item) => sum + item.qty, 0);
    assert.equal(product.stock, original.stock + returned, original.sku + ' physical stock');
    assert.equal(product.reserved, original.reserved, original.sku + ' reservations');
    assert.equal(inventory.getSellableStock(product),
      inventory.getSellableStock(original) + returned, original.sku + ' sellable stock');
  }

  store.write(db);
  const persisted = store.read();
  const afterFirst = structuredClone(persisted);
  assert.deepEqual(orders.cancel(persisted, 1007, 'Repeated cancellation'), {
    ok: false, error: 'Order #1007 is already cancelled'
  });
  assert.deepEqual(persisted, afterFirst, 'repeated cancellation changes neither stock nor khata');
});

fixtureTest('issue #2: cancelling an unknown order leaves the database unchanged', (db) => {
  const before = structuredClone(db);
  assert.deepEqual(orders.cancel(db, -1), { ok: false, error: 'Order not found' });
  assert.deepEqual(db, before);
});
