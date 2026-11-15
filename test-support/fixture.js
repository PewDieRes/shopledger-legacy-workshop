const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../lib/store');

module.exports = function fixtureTest(name, run) {
  test(name, { concurrency: false }, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopledger-test-'));
    const previousPath = process.env.SHOPLEDGER_DB_PATH;
    t.after(() => {
      if (previousPath === undefined) delete process.env.SHOPLEDGER_DB_PATH;
      else process.env.SHOPLEDGER_DB_PATH = previousPath;
      fs.rmSync(dir, { recursive: true, force: true });
    });
    process.env.SHOPLEDGER_DB_PATH = path.join(dir, 'db.json');
    fs.copyFileSync(path.join(__dirname, '../data/db.json'), process.env.SHOPLEDGER_DB_PATH);
    return run(store.read());
  });
};
