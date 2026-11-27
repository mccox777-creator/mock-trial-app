// Supabase Edge Function: nightly backup of every competition table to the private
// "backups" storage bucket, one dated JSON file per table. This is in addition to
// Supabase's own daily backups and point-in-time recovery.
//
// Deploy:   supabase functions deploy nightly-export
// Schedule: in the SQL editor (pg_cron + pg_net), run nightly at 3:00 AM UTC:
//   select cron.schedule('nightly-export', '0 3 * * *', $$
//     select net.http_post(url := '<project-url>/functions/v1/nightly-export',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_secret')));
// Secret:   pick a long random string, then
//           supabase secrets set BACKUP_CRON_SECRET=<it>
//           select vault.create_secret('<it>', 'backup_cron_secret');
// The service-role key never leaves the function, and the cron job never stores it.
//   $$);
//
// Off-site copy to Cloudflare R2 (optional, recommended). Set these secrets and every night's
// backup is also encrypted with your passphrase and uploaded to your R2 bucket:
//   supabase secrets set R2_ACCOUNT_ID=... R2_BUCKET=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... BACKUP_PASSPHRASE=...
// Decrypt on your computer with: node scripts/decrypt-backup.mjs <file>   (see BACKUPS.md)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { encryptBackup } from './crypto.ts';

const TABLES = [
  'profiles', 'programs', 'teams', 'team_members', 'messages', 'tournaments', 'registrations', 'judge_signups', 'matches', 'ballots',
  'cases', 'case_files', 'bulletins', 'recordings', 'change_log',
];

// Compare without leaking how much of the secret matched.
async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('BACKUP_CRON_SECRET') ?? '';
  if (secret.length < 32 || !(await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${secret}`))) return new Response('Forbidden', { status: 403 });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const day = new Date().toISOString().slice(0, 10);
  const report: Record<string, number> = {};
  const all: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').range(from, from + 999);
      if (error) return new Response(`Export failed on ${table}: ${error.message}`, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const { error } = await sb.storage.from('backups').upload(`${day}/${table}.json`, JSON.stringify(rows), { contentType: 'application/json', upsert: true });
    if (error) return new Response(`Upload failed on ${table}: ${error.message}`, { status: 500 });
    report[table] = rows.length;
    all[table] = rows;
  }

  // Off-site, encrypted copy in R2.
  const r2 = {
    account: Deno.env.get('R2_ACCOUNT_ID'),
    bucket: Deno.env.get('R2_BUCKET'),
    keyId: Deno.env.get('R2_ACCESS_KEY_ID'),
    secret: Deno.env.get('R2_SECRET_ACCESS_KEY'),
    passphrase: Deno.env.get('BACKUP_PASSPHRASE'),
  };
  let offsite = 'not set up';
  if (r2.account && r2.bucket && r2.keyId && r2.secret) {
    if (!r2.passphrase || r2.passphrase.length < 12) return new Response('BACKUP_PASSPHRASE must be at least 12 characters.', { status: 500 });
    const body = await encryptBackup(JSON.stringify({ day, tables: all }), r2.passphrase);
    const aws = new AwsClient({ accessKeyId: r2.keyId, secretAccessKey: r2.secret, service: 's3', region: 'auto' });
    const res = await aws.fetch(`https://${r2.account}.r2.cloudflarestorage.com/${r2.bucket}/mock-trial-${day}.backup`, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    if (!res.ok) return new Response(`R2 upload failed: ${res.status}`, { status: 502 });
    offsite = `r2://${r2.bucket}/mock-trial-${day}.backup`;
  }
  return new Response(JSON.stringify({ day, report, offsite }), { headers: { 'Content-Type': 'application/json' } });
});
