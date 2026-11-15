const assert = require('node:assert/strict');
const fixtureTest = require('../test-support/fixture');
const orders = require('../lib/orders');
const ledger = require('../lib/ledger');
const dates = require('../lib/dates');
const store = require('../lib/store');

fixtureTest('issue #3: history sorts all orders newest-first without changing stored dates or order', (db) => {
  const before = structuredClone(db);
  assert.deepEqual(orders.list(db).map((o) => o.id),
    [1008, 1007, 1006, 1005, 1004, 1003, 1002, 1001]);
  assert.deepEqual(db, before);
});

fixtureTest('issue #3: same-day orders sort by numeric id descending', (db) => {
  db.orders = [
    { id: '9', date: '15/03/2022' },
    { id: '10', date: '15/03/2022' },
    { id: 8, date: '15/03/2022' }
  ];
  assert.deepEqual(orders.list(db).map((o) => o.id), ['10', '9', 8]);
});

fixtureTest('issue #3: January 2022 range returns exactly January orders in date order', (db) => {
  for (const filters of [
    { from: '2022-01-01', to: '2022-01-31' },
    { from: '01/01/2022', to: '31/01/2022' }
  ]) {
    assert.deepEqual(orders.list(db, filters).map((o) => o.id), [1004, 1003, 1002]);
  }
});

fixtureTest('issue #3: date range boundaries are inclusive and work across years', (db) => {
  assert.deepEqual(orders.list(db, { from: '2021-12-28', to: '2022-01-05' }).map((o) => o.id), [1002, 1001]);
  assert.deepEqual(orders.list(db, { from: '2022-03-04' }).map((o) => o.id), [1008, 1007]);
  assert.deepEqual(orders.list(db, { to: '2021-12-28' }).map((o) => o.id), [1001]);
  assert.deepEqual(orders.list(db, { from: '2022-04-01', to: '2022-04-30' }), []);
  assert.deepEqual(orders.list(db, { from: '2022-01-01', to: '2022-01-31', search: 'SAVE10', status: 'completed' }).map((o) => o.id), [1004, 1002]);
});

fixtureTest('issue #3: date keys compare chronologically and fiscal years keep April boundaries', () => {
  assert.equal(dates.normalizeDateKey('28/12/2021'), '2021-12-28');
  assert.equal(dates.normalizeDateKey('2022-01-05'), '2022-01-05');
  for (const date of ['31/03/2022', '2022-03-31']) assert.equal(dates.getFiscalYear(date), 'FY21-22');
  for (const date of ['01/04/2022', '2022-04-01']) assert.equal(dates.getFiscalYear(date), 'FY22-23');
});

for (const amount of [500, '500']) {
  fixtureTest('issue #3: Meera settlement accepts ' + typeof amount + ' 500 and persists correct totals', (db) => {
    assert.equal(ledger.findCustomer(db, 1).balance, 1232.01);
    const result = ledger.recordSettlement(db, 1, amount, 'upi', 'Payment');
    assert.equal(result.ok, true);
    assert.equal(result.customer.totalSettled, 1700);
    assert.equal(result.customer.balance, 732.01);
    assert.equal(result.settlement.amount, 500);
    assert.equal(result.settlement.mode, 'upi');
    assert.equal(result.settlement.note, 'Payment');
    store.write(db);
    const persisted = store.read();
    assert.equal(ledger.listCustomers(persisted).find((c) => c.id === 1).balance, 732.01);
    assert.equal(persisted.settlements[0].amount, 500);
  });
}

fixtureTest('issue #3: invalid, non-finite, zero and negative settlements cannot mutate records', (db) => {
  const before = structuredClone(db);
  for (const amount of ['invalid', '500x', '', ' ', 0, '0', -1, '-1', NaN, Infinity, 'Infinity', null, undefined, true, [], {}]) {
    assert.equal(ledger.recordSettlement(db, 1, amount, 'cash', 'Invalid').ok, false, String(amount));
    assert.deepEqual(db, before);
  }
});

fixtureTest('issue #3: sequential decimal settlements remain numeric and rounded to paisa', (db) => {
  ledger.recordSettlement(db, 1, '0.10', 'cash');
  ledger.recordSettlement(db, 1, '0.20', 'cash');
  assert.equal(ledger.findCustomer(db, 1).totalSettled, 1200.30);
  assert.equal(ledger.findCustomer(db, 1).balance, 1231.71);
});
