const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');
const store = require('../lib/store');

// Each test gets its own persisted fixture. Never write to the repository DB.
function characterization(name, run) {
  test(name, { concurrency: false }, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopledger-stock-'));
    const previousPath = process.env.SHOPLEDGER_DB_PATH;
    t.after(() => {
      if (previousPath === undefined) delete process.env.SHOPLEDGER_DB_PATH;
      else process.env.SHOPLEDGER_DB_PATH = previousPath;
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const dbPath = path.join(dir, 'db.json');
    fs.copyFileSync(path.join(__dirname, '../data/db.json'), dbPath);
    process.env.SHOPLEDGER_DB_PATH = dbPath;
    run(store.read());
  });
}

function bySku(db, sku) {
  const product = db.products.find((p) => p.sku === sku);
  assert.ok(product, 'Fixture contains ' + sku);
  return product;
}

for (const [sku, physical, reserved] of [['DRY-001', 1, 0], ['SPC-001', 4, 3]]) {
  characterization('getSellableStock: ' + sku + ' excludes reserved units', (db) => {
    const product = bySku(db, sku);
    assert.equal(product.stock, physical);
    assert.equal(product.reserved, reserved);
    assert.equal(inventory.getSellableStock(product), 1);
  });

  // Both fixtures have one sellable unit, so zero is the only nonnegative
  // integer below sellable. The order route separately normalizes qty to >= 1.
  characterization('check: ' + sku + ' accepts qty below sellable (zero)', (db) => {
    const product = bySku(db, sku);
    assert.deepEqual(inventory.check(db.products, [{ id: product.id, qty: 0 }]), { ok: true });
  });

  characterization('FIXED (bug #2): ' + sku + ' accepts buying exact sellable qty', (db) => {
    const product = bySku(db, sku);
    assert.deepEqual(inventory.check(db.products, [{ id: product.id, qty: 1 }]), { ok: true });
  });

  characterization('check: ' + sku + ' rejects qty above sellable', (db) => {
    const product = bySku(db, sku);
    assert.deepEqual(inventory.check(db.products, [{ id: product.id, qty: 2 }]), {
      ok: false,
      msg: product.name + ' is out of stock (1 sellable available)'
    });
  });
}

characterization('getSellableStock: missing values default to zero and negative availability is clamped', () => {
  assert.equal(inventory.getSellableStock(null), 0);
  assert.equal(inventory.getSellableStock({}), 0);
  assert.equal(inventory.getSellableStock({ stock: 2, reserved: 3 }), 0);
  assert.equal(inventory.getSellableStock({ stock: '4', reserved: '3' }), 1);
});

characterization('check: accepts a positive quantity below sellable', (db) => {
  const product = bySku(db, 'GRN-001');
  assert.equal(inventory.getSellableStock(product), 16);
  assert.deepEqual(inventory.check(db.products, [{ id: product.id, qty: 1 }]), { ok: true });
});

characterization('reserve: deducts physical stock and leaves reservations unchanged', (db) => {
  const dry = bySku(db, 'DRY-001');
  const spice = bySku(db, 'SPC-001');
  inventory.reserve(db.products, [{ id: dry.id, qty: 1 }, { id: spice.id, qty: 1 }]);
  assert.deepEqual([dry.stock, dry.reserved], [0, 0]);
  assert.deepEqual([spice.stock, spice.reserved], [3, 3]);
  store.write(db);
  assert.deepEqual(store.read().products, db.products);
});

characterization('FIXED (bug #2): release restores physical stock for order items using id', (db) => {
  const before = structuredClone(db.products);
  inventory.release(db.products, [{ id: 6, qty: 2 }, { id: 4, qty: 2 }]);
  before.find((p) => p.id === 6).stock += 2;
  before.find((p) => p.id === 4).stock += 2;
  assert.deepEqual(db.products, before);
});

characterization('release: legacy productId quote holds reduce reservations without changing physical stock', (db) => {
  const spice = bySku(db, 'SPC-001');
  inventory.release(db.products, [{ productId: spice.id, qty: 2 }]);
  assert.deepEqual([spice.stock, spice.reserved], [4, 1]);
  inventory.release(db.products, [{ productId: spice.id, qty: 5 }]);
  assert.deepEqual([spice.stock, spice.reserved], [4, 0]);
});

characterization('FIXED (bug #2): cancelling order #1007 restores physical stock', (db) => {
  const before = structuredClone(db.products);
  const order = orders.get(db, 1007);
  assert.equal(order.status, 'pending');
  assert.deepEqual(order.items.map((item) => [item.id, item.qty]), [[6, 2], [4, 2]]);
  assert.deepEqual([bySku(db, 'DRY-001').stock, bySku(db, 'OIL-001').stock], [1, 22]);

  const result = orders.cancel(db, 1007, 'Characterization cancellation');
  assert.equal(result.ok, true);
  assert.equal(result.order.status, 'cancelled');
  assert.equal(result.order.cancelReason, 'Characterization cancellation');
  assert.match(result.order.cancelledAt, /^\d{2}\/\d{2}\/\d{4}$/);
  before.find((p) => p.id === 6).stock += 2;
  before.find((p) => p.id === 4).stock += 2;
  assert.deepEqual(db.products, before);
  assert.deepEqual([bySku(db, 'DRY-001').stock, bySku(db, 'OIL-001').stock], [3, 24]);
  const customer = db.customers.find((c) => c.id === 4);
  assert.equal(customer.totalBilled, 0);
  assert.equal(customer.balance, 200);

  store.write(db);
  const persisted = store.read();
  assert.equal(orders.get(persisted, 1007).status, 'cancelled');
  assert.deepEqual(persisted.products, before);
});
