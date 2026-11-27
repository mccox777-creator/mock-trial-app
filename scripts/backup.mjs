// Free backup: copies every table and every case file from Supabase into a dated folder.
//
//   1. Copy scripts/backup.env.example to scripts/backup.env and fill in the two values
//      (Supabase dashboard > Project Settings > API). That file never leaves your computer.
//   2. Run:  node scripts/backup.mjs            (or: npm run backup)
//
// Backups land in ./backups/<date>/ unless BACKUP_DIR says otherwise. The newest 60 days are kept.
// See BACKUPS.md for running it automatically every day, and for restoring.
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, 'backup.env');
if (existsSync(envFile)) {
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill in scripts/backup.env first.');
  process.exit(1);
}
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 60);
const root = resolve(process.env.BACKUP_DIR ?? join(here, '..', 'backups'));
const day = new Date().toISOString().slice(0, 10);
const out = join(root, day);

const TABLES = [
  'profiles', 'programs', 'teams', 'team_members', 'tournaments', 'registrations', 'judge_signups', 'matches',
  'ballots', 'cases', 'case_files', 'bulletins', 'recordings', 'messages', 'change_log',
];

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await mkdir(join(out, 'case-files'), { recursive: true });

const summary = {};
for (const table of TABLES) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  await writeFile(join(out, `${table}.json`), JSON.stringify(rows, null, 1));
  summary[table] = rows.length;
}

// Case files: walk the bucket folder by folder.
let files = 0;
async function copyFolder(prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from('case-files').list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Could not list case files: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        await copyFolder(path); // a folder
        continue;
      }
      const dest = join(out, 'case-files', path);
      const { data: blob, error: e2 } = await sb.storage.from('case-files').download(path);
      if (e2) throw new Error(`Could not download ${path}: ${e2.message}`);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(await blob.arrayBuffer()));
      files++;
    }
    if (data.length < 1000) break;
  }
}
await copyFolder('');

await writeFile(join(out, 'summary.json'), JSON.stringify({ day, tables: summary, caseFiles: files }, null, 1));

// Keep the newest KEEP_DAYS days.
const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
for (const name of await readdir(root)) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff) await rm(join(root, name), { recursive: true, force: true });
}

console.log(`Backed up ${Object.values(summary).reduce((a, b) => a + b, 0)} rows and ${files} case files to ${out}`);
