const validCode = value => typeof value === 'string' && /^[A-Z]{3,4}$/.test(value);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Validate the entire response before the updater touches the previous backup.
export function buildBackup(catalog, rows, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(catalog) || catalog.length < 100 || !Array.isArray(rows) || rows.length < 100) {
    throw Error('Incomplete provider response; previous backup retained');
  }
  const seen = new Set();
  const currencies = catalog.map(row => {
    if (!row || !validCode(row.iso_code) || typeof row.name !== 'string' || !row.name.trim() || seen.has(row.iso_code)) {
      throw Error('Invalid catalog; previous backup retained');
    }
    seen.add(row.iso_code);
    return { code: row.iso_code, name: row.name.trim() };
  }).sort((a, b) => a.code.localeCompare(b.code));
  if (!seen.has('USD')) throw Error('Missing base currency; previous backup retained');
  const rates = {}, dates = {};
  for (const row of rows) {
    if (!row || row.base !== 'USD' || !validCode(row.quote) || !seen.has(row.quote) || !validDate(row.date) || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || row.rate <= 0 || (row.quote === 'USD' && row.rate !== 1) || Object.hasOwn(rates, row.quote)) {
      throw Error('Invalid rates; previous backup retained');
    }
    rates[row.quote] = row.rate;
    dates[row.quote] = row.date;
  }
  const date = Object.values(dates).sort().at(-1);
  rates.USD = 1;
  dates.USD = date;
  const snapshot = { base: 'USD', date, fetchedAt, rates, source: 'Frankfurter', cadence: 'daily', dates };
  return { schemaVersion: 1, snapshot, currencies };
}
