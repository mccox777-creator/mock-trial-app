// Optional: the app already ships with src/data/history-law-school.json. Use this only to add or correct
// entries in the live database without a new app release. Dry run unless --yes.
//   npm run import-history -- src/data/history-law-school.json [--yes]
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from scripts/backup.env (never commit that file).
import { readFileSync, existsSync } from 'node:fs';

const env = {};
const envFile = new URL('./backup.env', import.meta.url);
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const URL_ = process.env.SUPABASE_URL ?? env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv.find((a) => a.endsWith('.json'));
const go = process.argv.includes('--yes');
if (!file) throw new Error('Pass the JSON file to import.');

const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const rows = JSON.parse(readFileSync(file, 'utf8')).map((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [snake(k), v])));
const seasons = [...new Set(rows.map((r) => r.season))].sort();
console.log(`${rows.length} competitions, seasons ${seasons.join(', ')}; ${rows.filter((r) => r.needs_review).length} flagged for review.`);
if (!go) {
  console.log('Dry run. Add --yes to write them.');
  process.exit(0);
}
if (!URL_ || !KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in scripts/backup.env.');
for (let i = 0; i < rows.length; i += 200) {
  const res = await fetch(`${URL_}/rest/v1/past_events`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.slice(i, i + 200)),
  });
  if (!res.ok) throw new Error(`Import failed at row ${i}: ${res.status} ${await res.text()}`);
  console.log(`Wrote ${Math.min(i + 200, rows.length)} of ${rows.length}`);
}
console.log('Done. Running it again updates the same rows instead of adding copies.');
