const assert = require('node:assert/strict');
const fixtureTest = require('../test-support/fixture');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

// Snapshot each invoice's subtotal, discount, GST, CGST, SGST, total and line GST.
const figures = {
  1001: [610, 0, 66.90, 33.45, 33.45, 676.90, [50.40, 16.50], [18, 5]],
  1002: [1020, 102, 45.90, 22.95, 22.95, 963.90, [28.80, 17.10], [5, 5]],
  1003: [400, 50, 49.35, 24.68, 24.67, 399.35, [27.30, 22.05], [12, 18]],
  1004: [2240, 150, 104.50, 52.25, 52.25, 2194.50, [104.50], [5]],
  1005: [1000, 50, 91.96, 45.98, 45.98, 1041.96, [30.40, 61.56], [5, 18]],
  1006: [1210, 60.50, 155.61, 77.81, 77.80, 1305.11, [102.60, 53.01], [12, 18]],
  1007: [1280, 0, 127, 63.50, 63.50, 1407, [108, 19], [12, 5]],
  1008: [500, 0, 90, 45, 45, 590, [25.20, 64.80], [18, 18]]
};

for (const id of Object.keys(figures)) {
  const label = id === '1008' ? 'CURRENT BEHAVIOUR (bug #1): ' : 'FIXED (bug #1): ';
  fixtureTest(label + 'invoice figures for order #' + id, (db) => {
    const calc = invoice.computeInvoiceFigures(db.orders.find((o) => o.id === Number(id)));
    assert.deepEqual([
      calc.subtotal, calc.discount, calc.tax, calc.cgst, calc.sgst, calc.total,
      calc.rows.map((r) => r.lineTax), calc.rows.map((r) => r.gstPercent)
    ], figures[id]);
  });
}

fixtureTest('FIXED (bug #1): GST reconciliation matches all eight orders', (db) => {
  const result = reports.getGstReconciliation(db);
  assert.equal(result.totalChecked, 8);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
});
