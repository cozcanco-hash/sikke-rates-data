import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBackup } from './backup.mjs';

const endpoint = 'https://api.frankfurter.dev/v2';
export async function updateBackup({ fetchImpl = fetch, output = new URL('../data/last-good.json', import.meta.url) } = {}) {
  async function load(path) {
    const response = await fetchImpl(endpoint + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Frankfurter HTTP ${response.status}`);
    return response.json();
  }
  const [catalog, rows] = await Promise.all([load('/currencies'), load('/rates?base=USD')]);
  const backup = buildBackup(catalog, rows);
  const filename = output instanceof URL ? fileURLToPath(output) : output;
  await mkdir(dirname(filename), { recursive: true });
  // Replace only after a complete, validated file has been written.
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(backup, null, 2) + '\n');
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
  return backup;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { currencies, snapshot } = await updateBackup();
  console.log(JSON.stringify({ saved: true, currencies: currencies.length, rates: Object.keys(snapshot.rates).length, date: snapshot.date, fetchedAt: snapshot.fetchedAt }));
}
