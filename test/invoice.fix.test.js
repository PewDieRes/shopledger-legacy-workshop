const assert = require('node:assert/strict');
const fixtureTest = require('../test-support/fixture');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const tax = require('../lib/tax');
const reports = require('../lib/reports');

const paisa = (value) => Math.round(value * 100);

for (let id = 1001; id <= 1008; id++) {
  fixtureTest('issue #1: invoice #' + id + ' matches billed and checkout figures to the paisa', (db) => {
    const order = db.orders.find((o) => o.id === id);
    const before = structuredClone(order);
    const checkout = pricing.computeTotals(order.items, order.coupon);
    const calc = invoice.computeInvoiceFigures(order);
    for (const key of ['subtotal', 'discount', 'tax', 'total']) {
      assert.equal(paisa(calc[key]), paisa(order[key]), key + ' matches the stored bill');
      assert.equal(paisa(calc[key]), paisa(checkout[key]), key + ' matches checkout');
    }
    assert.equal(paisa(calc.cgst), paisa(checkout.cgst));
    assert.equal(paisa(calc.sgst), paisa(checkout.sgst));
    assert.equal(paisa(calc.cgst) + paisa(calc.sgst), paisa(order.tax));
    assert.equal(calc.rows.length, order.items.length);
    calc.rows.forEach((row, i) => {
      assert.equal(row.gstPercent, tax.getSlabPercent(order.items[i]));
      assert.equal(paisa(row.lineTax), paisa(checkout.lines[i].tax));
      assert.equal(paisa(row.line), paisa(checkout.lines[i].gross));
      assert.equal(row.sku, order.items[i].sku);
      assert.equal(row.hsn, order.items[i].hsn);
    });
    assert.equal(calc.rows.reduce((sum, row) => sum + paisa(row.lineTax), 0), paisa(calc.tax));
    const html = invoice.render(order);
    assert.ok(html.includes('₹' + order.total.toFixed(2)));
    assert.ok(!html.includes('Accountant Reconciliation Notice:'));
    assert.deepEqual(order, before, 'invoice calculation/rendering cannot change the stored bill');
  });
}

fixtureTest('issue #1: SAVE10 discount is capped at 150 and groundnut oil uses 5% GST', (db) => {
  const calc = invoice.computeInvoiceFigures(db.orders.find((o) => o.id === 1004));
  assert.equal(calc.discount, 150);
  assert.equal(calc.rows[0].gstPercent, 5);
  assert.equal(calc.rows[0].lineTax, 104.50);
  assert.equal(calc.total, 2194.50);
});

fixtureTest('issue #1: explicit GST rates and fallback use the shared tax rules', () => {
  for (const item of [
    { price: 100, qty: 1, hsn: '1006' },
    { price: 100, qty: 1, hsn: '0405' },
    { price: 100, qty: 1, hsn: '0902' },
    { price: 100, qty: 1, hsn: 'unknown' },
    { price: 100, qty: 1, gstRate: 0.05 },
    { price: 100, qty: 1, gstRate: 12 },
    { price: 100, qty: 1, hsn: '0902', gstRate: 0 }
  ]) {
    const checkout = pricing.computeTotals([item], '');
    const calc = invoice.computeInvoiceFigures({ items: [item], coupon: '' });
    assert.equal(calc.rows[0].gstPercent, tax.getSlabPercent(item));
    assert.equal(calc.tax, checkout.tax);
    assert.equal(calc.total, checkout.total);
  }
});

fixtureTest('issue #1: stored billed figures remain authoritative when recalculation differs', (db) => {
  const order = db.orders.find((o) => o.id === 1002);
  // Model a historical bill whose captured figures differ from today's rules.
  Object.assign(order, { subtotal: 1000, discount: 100, tax: 45, total: 945 });
  const before = structuredClone(order);
  const calc = invoice.computeInvoiceFigures(order);
  assert.deepEqual([calc.subtotal, calc.discount, calc.tax, calc.total], [1000, 100, 45, 945]);
  assert.equal(calc.cgst, 22.50);
  assert.equal(calc.sgst, 22.50);
  assert.deepEqual(order, before);
});

fixtureTest('issue #1: GST reconciliation and dashboard show zero mismatches', (db) => {
  const before = structuredClone(db);
  const result = reports.getGstReconciliation(db);
  assert.equal(result.totalChecked, 8);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.ok(result.rows.every((r) => r.matched && r.delta === 0));
  const summary = reports.getDashboardSummary(db);
  assert.equal(summary.reconciliationMismatchCount, 0);
  assert.equal(summary.reconciliationTotalDelta, 0);
  assert.deepEqual(db, before);
});
