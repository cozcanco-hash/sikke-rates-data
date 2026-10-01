import { mkdir, writeFile } from 'node:fs/promises';
const endpoint='https://api.frankfurter.dev/v2';
async function load(path) {
  const response=await fetch(endpoint+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error(`Frankfurter HTTP ${response.status}`);
  return response.json();
}
const [catalog,rows]=await Promise.all([load('/currencies'),load('/rates?base=USD')]);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
if(!Array.isArray(catalog)||catalog.length<100||!Array.isArray(rows)||rows.length<100) throw Error('Incomplete provider response; previous backup retained');
const seen=new Set();
const currencies=catalog.map(row=>{
  if(!/^[A-Z]{3}$/.test(row.iso_code)||typeof row.name!=='string'||!row.name.trim()||seen.has(row.iso_code)) throw Error('Invalid catalog');
  seen.add(row.iso_code); return {code:row.iso_code,name:row.name.trim()};
}).sort((a,b)=>a.code.localeCompare(b.code));
const rates={},dates={};
for(const row of rows){
  if(row.base!=='USD'||!seen.has(row.quote)||!validDate(row.date)||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0||row.quote in rates) throw Error('Invalid rates; previous backup retained');
  rates[row.quote]=row.rate;dates[row.quote]=row.date;
}
const date=Object.values(dates).sort().at(-1);rates.USD=1;dates.USD=date;
const snapshot={base:'USD',date,fetchedAt:new Date().toISOString(),rates,source:'Frankfurter',cadence:'daily',dates};
const backup={schemaVersion:1,snapshot,currencies};
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(new URL('../data/last-good.json',import.meta.url),JSON.stringify(backup,null,2)+'\n');
console.log(JSON.stringify({saved:true,currencies:currencies.length,rates:Object.keys(rates).length,date,fetchedAt:snapshot.fetchedAt}));
