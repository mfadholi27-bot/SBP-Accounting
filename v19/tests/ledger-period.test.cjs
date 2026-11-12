const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'source function markers must exist');
  return source.slice(start, end);
}
const ledgerSource = extract('function getLedgerTransactionsRange(', 'function getLedgerSelection(');
const getLedgerTransactionsRange = new Function(
  'state', 'isPostedJournal', 'ledgerOpeningNet',
  ledgerSource + '; return getLedgerTransactionsRange;'
);
const selectionSource = extract('function getLedgerSelection(', 'function updateLedgerPeriodMode(');
const getLedgerSelection = new Function('$', selectionSource + '; return getLedgerSelection;');

function fixture() {
  return {
    accounts: [{ code: '1000', name: 'Kas' }],
    openingBalances: [{ period: '2026-01', accountCode: '1000', debit: 1000, credit: 0 }],
    journals: [
      { id: 1, date: '2026-01-05', number: 'J-001', status: 'posted', lines: [{ code: '1000', debit: 50, credit: 0 }] },
      { id: 2, date: '2026-02-10', number: 'J-002', status: 'posted', lines: [{ code: '1000', debit: 20, credit: 5 }] },
      { id: 3, date: '2026-02-15', number: 'J-003', status: 'draft', lines: [{ code: '1000', debit: 900, credit: 0 }] },
      { id: 4, date: '2026-02-18', number: 'J-004', status: 'cancelled', lines: [{ code: '1000', debit: 700, credit: 0 }] }
    ]
  };
}
function runLedger(state, from, to) {
  return getLedgerTransactionsRange(state, j => j.status === 'posted',
    (period, account) => {
      const row = state.openingBalances.find(x => x.period === period && String(x.accountCode) === String(account.code));
      return row ? Number(row.debit || 0) - Number(row.credit || 0) : 0;
    })(from, to, '1000');
}

test('date-range opening balance carries posted activity before range and excludes draft/cancelled', () => {
  const state = fixture();
  const result = runLedger(state, '2026-01-10', '2026-02-28');
  assert.equal(result.openingNet, 1050);
  assert.equal(result.rows.filter(x => x.kind === 'movement').length, 1);
  assert.equal(result.endingNet, 1065);
  assert.equal(result.rows.at(-1).balance, 1065);
});

test('monthly and yearly periods use correct date boundaries', () => {
  const fields = { 'ledger-mode': { value: 'month' }, 'ledger-period': { value: '2026-02' }, 'ledger-year': { value: '2026' }, 'ledger-from': { value: '2026-02-01' }, 'ledger-to': { value: '2026-02-28' } };
  const $ = id => fields[id];
  let get = getLedgerSelection($);
  assert.deepEqual(get(), { from: '2026-02-01', to: '2026-02-28', label: '2026-02' });
  fields['ledger-mode'].value = 'year';
  assert.deepEqual(get(), { from: '2026-01-01', to: '2026-12-31', label: '2026' });
  fields['ledger-mode'].value = 'range';
  assert.deepEqual(get(), { from: '2026-02-01', to: '2026-02-28', label: '2026-02-01 s.d. 2026-02-28' });
});

test('ledger calculation is read-only and does not mutate journal or opening balances', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  runLedger(state, '2026-01-01', '2026-12-31');
  assert.equal(JSON.stringify(state), before);
});

test('rejects invalid or reversed date ranges', () => {
  const state = fixture();
  assert.equal(runLedger(state, '2026-02-28', '2026-02-01'), null);
  assert.equal(runLedger(state, '2026-99-01', '2026-99-30'), null);
});
