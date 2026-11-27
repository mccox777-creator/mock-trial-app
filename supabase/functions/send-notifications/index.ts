// Supabase Edge Function: delivers queued notifications as phone alerts and emails.
//
// Run it every minute with pg_cron, and once a day with ?digest=1 for people who chose a daily email:
//   select cron.schedule('send-notifications', '* * * * *', $$ select net.http_post(
//     url := '<project-url>/functions/v1/send-notifications',
//     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret'))) $$);
//   select cron.schedule('daily-digest', '0 13 * * *', $$ select net.http_post(
//     url := '<project-url>/functions/v1/send-notifications?digest=1',
//     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret'))) $$);
//
// Secrets: NOTIFY_CRON_SECRET (long random string, also stored in vault as notify_cron_secret),
//          RESEND_API_KEY and EMAIL_FROM (e.g. "Mock Trial Docket <notices@yourdomain.org>") for email.
// Without Resend settings, only phone alerts go out; notices still appear in each person's inbox.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Row = { id: number; user_id: string; kind: string; title: string; body: string; link: string; push_sent_at: string | null; email_sent_at: string | null };
type Prefs = { user_id: string; push: boolean; email: boolean; email_digest: boolean };

async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const FOOTER = '<p style="color:#5A6679;font-size:12px">You get these because of your notification settings in the Mock Trial Docket app (Me &gt; Notifications). Change or turn them off there at any time.</p>';

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_CRON_SECRET') ?? '';
  if (secret.length < 32 || !(await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${secret}`))) return new Response('Forbidden', { status: 403 });
  const digest = new URL(req.url).searchParams.get('digest') === '1';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  const now = new Date().toISOString();

  // Notices from the last 3 days that still need a push or an email.
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: rows, error } = await sb
    .from('notifications')
    .select('id, user_id, kind, title, body, link, push_sent_at, email_sent_at')
    .gte('created_at', since)
    .or('push_sent_at.is.null,email_sent_at.is.null')
    .order('created_at')
    .limit(2000);
  if (error) return new Response(error.message, { status: 500 });
  const pending = (rows ?? []) as Row[];
  const users = [...new Set(pending.map((r) => r.user_id))];
  if (users.length === 0) return Response.json({ push: 0, email: 0 });

  const { data: prefRows } = await sb.from('notification_prefs').select('user_id, push, email, email_digest').in('user_id', users);
  const prefs = new Map((prefRows ?? []).map((p: Prefs) => [p.user_id, p]));
  const pref = (u: string): Prefs => prefs.get(u) ?? { user_id: u, push: true, email: true, email_digest: false };

  // ---- Phone alerts (Expo push service; free) ----
  let pushed = 0;
  const forPush = digest ? [] : pending.filter((r) => !r.push_sent_at);
  if (forPush.length) {
    const { data: tokens } = await sb.from('push_tokens').select('token, user_id').in('user_id', [...new Set(forPush.map((r) => r.user_id))]);
    const byUser = new Map<string, string[]>();
    for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
    const msgs = forPush.flatMap((r) =>
      pref(r.user_id).push ? (byUser.get(r.user_id) ?? []).map((to) => ({ to, title: r.title, body: r.body, data: { link: r.link }, sound: 'default' })) : [],
    );
    for (let i = 0; i < msgs.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgs.slice(i, i + 100)) });
      if (res.ok) pushed += Math.min(100, msgs.length - i);
    }
    await sb.from('notifications').update({ push_sent_at: now }).in('id', forPush.map((r) => r.id));
  }

  // ---- Email (Resend) ----
  // Chat never goes to email. Instant-email people get one email per notice; digest people one a day.
  let emailed = 0;
  const emailable = pending.filter((r) => !r.email_sent_at);
  const skip = emailable.filter((r) => r.kind === 'chat' || !pref(r.user_id).email || !resendKey || !from);
  const send = emailable.filter((r) => !skip.includes(r) && pref(r.user_id).email_digest === digest);
  if (skip.length) await sb.from('notifications').update({ email_sent_at: now }).in('id', skip.map((r) => r.id));
  if (send.length && resendKey && from) {
    const byUser = new Map<string, Row[]>();
    for (const r of send) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    for (const [uid, items] of byUser) {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      const to = u?.user?.email;
      if (!to) continue;
      const batches = digest ? [items] : items.map((r) => [r]);
      for (const batch of batches) {
        const subject = batch.length === 1 ? batch[0].title : `${batch.length} updates from Mock Trial Docket`;
        const html = batch.map((r) => `<h3 style="margin:16px 0 4px">${esc(r.title)}</h3><p style="margin:0">${esc(r.body)}</p>`).join('') + FOOTER;
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, html }),
        });
        if (res.ok) {
          emailed++;
          await sb.from('notifications').update({ email_sent_at: now }).in('id', batch.map((r) => r.id));
        }
      }
    }
  }
  return Response.json({ push: pushed, email: emailed });
});
