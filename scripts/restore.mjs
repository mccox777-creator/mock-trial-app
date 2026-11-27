// Puts a backup made by scripts/backup.mjs back into Supabase.
//
//   node scripts/restore.mjs backups/2026-11-27            (shows what it would do)
//   node scripts/restore.mjs backups/2026-11-27 --yes      (does it)
//
// Rows in the backup are written back over the current ones (matched by id). Rows created
// after the backup are left alone. Case files are uploaded again. Uses scripts/backup.env.
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, 'backup.env');
if (existsSync(envFile)) {
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const folder = process.argv[2] && resolve(process.argv[2]);
const go = process.argv.includes('--yes');
if (!folder || !existsSync(join(folder, 'summary.json'))) {
  console.error('Usage: node scripts/restore.mjs <backup folder> [--yes]');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill in scripts/backup.env first.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Parents before children, so every reference already exists.
const ORDER = [
  ['programs', 'id'], ['teams', 'id'], ['cases', 'id'], ['tournaments', 'id'], ['registrations', 'id'],
  ['judge_signups', 'id'], ['matches', 'id'], ['ballots', 'id'], ['case_files', 'id'], ['bulletins', 'id'],
  ['recordings', 'id'], ['messages', 'id'], ['profiles', 'id'], ['team_members', 'team_id,user_id'],
];

for (const [table, key] of ORDER) {
  const file = join(folder, `${table}.json`);
  if (!existsSync(file)) continue;
  const rows = JSON.parse(await readFile(file, 'utf8'));
  console.log(`${go ? 'Restoring' : 'Would restore'} ${rows.length} rows in ${table}`);
  if (!go) continue;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: key });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) yield* walk(p);
    else yield p;
  }
}
let files = 0;
for await (const p of walk(join(folder, 'case-files'))) {
  files++;
  if (!go) continue;
  const path = relative(join(folder, 'case-files'), p).split('\\').join('/');
  const { error } = await sb.storage.from('case-files').upload(path, await readFile(p), { upsert: true });
  if (error) throw new Error(`${path}: ${error.message}`);
}
console.log(`${go ? 'Restored' : 'Would restore'} ${files} case files.`);
if (!go) console.log('\nNothing changed. Run again with --yes to restore.');
