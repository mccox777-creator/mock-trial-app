// Unlocks an encrypted nightly backup downloaded from R2 and unpacks it into a folder that
// scripts/restore.mjs understands.
//
//   node scripts/decrypt-backup.mjs mock-trial-2026-11-27.backup
//
// Asks for the passphrase (or set BACKUP_PASSPHRASE). Writes ./backups/<date>-from-r2/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { join, resolve } from 'node:path';

const MAGIC = 'MTDB1';
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/decrypt-backup.mjs <file.backup>');
  process.exit(1);
}
const bytes = new Uint8Array(await readFile(file));
if (new TextDecoder().decode(bytes.slice(0, 5)) !== MAGIC) {
  console.error('This is not a Mock Trial Docket backup file.');
  process.exit(1);
}
let passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  passphrase = await rl.question('Backup passphrase: ');
  rl.close();
}
const salt = bytes.slice(5, 21);
const iv = bytes.slice(21, 33);
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
let gz;
try {
  gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(33));
} catch {
  console.error('Wrong passphrase, or the file is damaged.');
  process.exit(1);
}
const json = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const { day, tables } = JSON.parse(json);
const out = resolve(process.env.BACKUP_DIR ?? 'backups', `${day}-from-r2`);
await mkdir(out, { recursive: true });
const summary = {};
for (const [table, rows] of Object.entries(tables)) {
  await writeFile(join(out, `${table}.json`), JSON.stringify(rows, null, 1));
  summary[table] = rows.length;
}
await writeFile(join(out, 'summary.json'), JSON.stringify({ day, tables: summary, caseFiles: 0, note: 'Case files are not in the nightly R2 copy; use a computer backup for those.' }, null, 1));
console.log(`Unlocked the ${day} backup into ${out}`);
