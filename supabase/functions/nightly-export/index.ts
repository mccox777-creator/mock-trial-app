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
// For an off-provider copy, also sync the bucket to S3 or Google Drive (see README).
import { createClient } from 'npm:@supabase/supabase-js@2';

const TABLES = [
  'programs', 'teams', 'tournaments', 'registrations', 'judge_signups', 'matches', 'ballots',
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
  }
  return new Response(JSON.stringify({ day, report }), { headers: { 'Content-Type': 'application/json' } });
});
