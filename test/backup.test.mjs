import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildBackup } from '../scripts/backup.mjs';
import { updateBackup } from '../scripts/update.mjs';

function fixture() {
  const codes = Array.from({ length: 100 }, (_, i) => 'A' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26));
  codes.push('USD', 'EUR', 'AAVE', 'ALGO', 'ATOM', 'AVAX', 'HBAR', 'LINK', 'MANA', 'NEAR', 'ONDO', 'USDC', 'USDT');
  return {
    catalog: codes.map(iso_code => ({ iso_code, name: ` ${iso_code} name ` })),
    rows: codes.filter(code => code !== 'USD').map(quote => ({ base: 'USD', quote, rate: 1.5, date: quote === 'EUR' ? '2026-11-05' : '2026-11-06' })),
  };
}
const fetchedAt = '2026-11-07T10:00:00.000Z';

test('accepts 3–4 letter symbols and preserves publication dates, daily cadence and fetch time', () => {
  const { catalog, rows } = fixture();
  const result = buildBackup(catalog, rows, fetchedAt);
  assert.equal(result.schemaVersion, 1);
  for (const code of ['AAVE', 'ALGO', 'ATOM', 'AVAX', 'HBAR', 'LINK', 'MANA', 'NEAR', 'ONDO', 'USDC', 'USDT']) {
    assert.equal(result.snapshot.rates[code], 1.5);
  }
  assert.equal(result.snapshot.rates.USDT, 1.5);
  assert.equal(result.snapshot.rates.USD, 1);
  assert.equal(result.snapshot.date, '2026-11-06');
  assert.equal(result.snapshot.dates.EUR, '2026-11-05');
  assert.equal(result.snapshot.dates.AAVE, '2026-11-06');
  assert.equal(result.snapshot.fetchedAt, fetchedAt);
  assert.equal(result.snapshot.cadence, 'daily');
  assert.equal(result.snapshot.source, 'Frankfurter');
  assert.equal(result.currencies.find(row => row.code === 'AAVE').name, 'AAVE name');
});

for (const code of ['', 'AB', 'ABCDE', 'doge', 'D0GE', 'AAVE ', '__proto__', null, 123]) {
  test(`rejects malformed catalog symbol ${JSON.stringify(code)}`, () => {
    const { catalog, rows } = fixture();
    catalog[0].iso_code = code;
    assert.throws(() => buildBackup(catalog, rows), /Invalid catalog/);
  });
}

const invalidCases = {
  'null catalog row': data => { data.catalog[0] = null; },
  'blank catalog name': data => { data.catalog[0].name = ' '; },
  'duplicate catalog symbol': data => { data.catalog[1] = data.catalog[0]; },
  'incomplete catalog': data => { data.catalog.length = 99; },
  'incomplete rates': data => { data.rows.length = 99; },
  'non-array catalog': data => { data.catalog = {}; },
  'non-array rates': data => { data.rows = null; },
  'missing USD catalog entry': data => { data.catalog = data.catalog.filter(row => row.iso_code !== 'USD'); },
  'invalid USD identity rate': data => { data.rows.push({ base: 'USD', quote: 'USD', rate: 2, date: '2026-11-06' }); },
  'null rate row': data => { data.rows[0] = null; },
  'duplicate quote': data => { data.rows[1] = data.rows[0]; },
  'unknown quote': data => { data.rows[0].quote = 'ZZZZ'; },
  'wrong base': data => { data.rows[0].base = 'EUR'; },
  'string rate': data => { data.rows[0].rate = '1.5'; },
  'zero rate': data => { data.rows[0].rate = 0; },
  'negative rate': data => { data.rows[0].rate = -1; },
  'NaN rate': data => { data.rows[0].rate = NaN; },
  'infinite rate': data => { data.rows[0].rate = Infinity; },
  'impossible day': data => { data.rows[0].date = '2026-02-30'; },
  'impossible month': data => { data.rows[0].date = '2026-13-01'; },
  'timestamp instead of date': data => { data.rows[0].date = fetchedAt; },
};

for (const [label, corrupt] of Object.entries(invalidCases)) {
  test(`${label} fails closed and retains the previous backup bytes`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'sikke-backup-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = join(dir, 'last-good.json');
    const previous = '{"previous":"keep exactly"}\n';
    await writeFile(output, previous);
    const data = fixture();
    corrupt(data);
    const fetchImpl = async url => ({ ok: true, json: async () => url.endsWith('/currencies') ? data.catalog : data.rows });
    await assert.rejects(updateBackup({ fetchImpl, output }));
    assert.equal(await readFile(output, 'utf8'), previous);
  });
}

for (const failure of ['HTTP', 'network', 'JSON']) {
  test(`${failure} failure leaves previous backup intact`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'sikke-backup-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = join(dir, 'last-good.json');
    await writeFile(output, 'previous');
    const fetchImpl = async () => {
      if (failure === 'network') throw Error('network');
      return { ok: failure !== 'HTTP', status: 503, json: async () => { throw Error('JSON'); } };
    };
    await assert.rejects(updateBackup({ fetchImpl, output }));
    assert.equal(await readFile(output, 'utf8'), 'previous');
  });
}

test('valid response replaces backup with the validated snapshot', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sikke-backup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'last-good.json');
  await writeFile(output, 'previous');
  const { catalog, rows } = fixture();
  const fetchImpl = async url => ({ ok: true, json: async () => url.endsWith('/currencies') ? catalog : rows });
  const backup = await updateBackup({ fetchImpl, output });
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), backup);
  assert.equal(backup.snapshot.rates.AAVE, 1.5);
});

test('accepts an explicit USD identity rate of one', () => {
  const { catalog, rows } = fixture();
  rows.push({ base: 'USD', quote: 'USD', rate: 1, date: '2026-11-06' });
  const backup = buildBackup(catalog, rows, fetchedAt);
  assert.equal(backup.snapshot.rates.USD, 1);
  assert.equal(backup.snapshot.date, '2026-11-06');
});
