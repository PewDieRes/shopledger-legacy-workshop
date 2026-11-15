const assert = require('node:assert/strict');
const fixtureTest = require('../test-support/fixture');
const orders = require('../lib/orders');
const ledger = require('../lib/ledger');

fixtureTest('FIXED (bug #3): history sorts by real date newest-first', (db) => {
  assert.deepEqual(orders.list(db).map((o) => o.id),
    [1008, 1007, 1006, 1005, 1004, 1003, 1002, 1001]);
});

fixtureTest('FIXED (bug #3): January date filter includes only January orders', (db) => {
  assert.deepEqual(orders.list(db, { from: '2022-01-01', to: '2022-01-31' }).map((o) => o.id),
    [1004, 1003, 1002]);
});

fixtureTest('CURRENT BEHAVIOUR (bug #3): numeric settlement already adds correctly', (db) => {
  const result = ledger.recordSettlement(db, 1, 500, 'cash', 'Characterization');
  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
});

fixtureTest('FIXED (bug #3): string settlement adds numerically to totalSettled', (db) => {
  const result = ledger.recordSettlement(db, 1, '500', 'cash', 'Characterization');
  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
});

fixtureTest('FIXED (bug #3): non-numeric settlement is rejected without corrupting the balance', (db) => {
  const before = structuredClone(db);
  const result = ledger.recordSettlement(db, 1, 'invalid', 'cash', 'Characterization');
  assert.equal(result.ok, false);
  assert.deepEqual(db, before);
});
