// Supabase Edge Function: reads a photographed paper ballot and returns the scores
// for the organizer to confirm. Nothing is saved here; the app shows the result in
// the ballot form and the organizer submits it.
//
// Deploy:  supabase functions deploy read-ballot
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...
import Anthropic from 'npm:@anthropic-ai/sdk';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import { z } from 'npm:zod';
import { createClient } from 'npm:@supabase/supabase-js@2';

const client = new Anthropic();

const BallotReading = z.object({
  judge_name: z.string().describe('Judge name written on the ballot, or empty string if none'),
  plaintiff_scores: z.array(z.number().nullable()).describe('One score per line, in the order given; null if unreadable'),
  defense_scores: z.array(z.number().nullable()),
  plaintiff_total_written: z.number().nullable().describe('Total the judge wrote for plaintiff/prosecution, if any'),
  defense_total_written: z.number().nullable(),
  unreadable_notes: z.string().describe('Anything that was hard to read or ambiguous; empty if none'),
});

const MEDIA_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BASE64 = 7_000_000; // about 5 MB of image

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return fail(405, 'Use POST.');

  // Signed-in callers only. The client acts with the caller's own rights, so every check below
  // is the database's row rules, not something this function decides.
  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: user } = await supabase.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!user?.user) return fail(401, 'Sign in first.');

  let body: { matchId?: unknown; imageBase64?: unknown; mediaType?: unknown; lines?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const { matchId, imageBase64, mediaType, lines } = body;
  if (typeof matchId !== 'string' || matchId.length > 100) return fail(400, 'Bad request.');
  if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) return fail(413, 'Photo is too large or not an image. Try again at a lower resolution.');
  if (typeof mediaType !== 'string' || !MEDIA_TYPES.includes(mediaType)) return fail(415, 'Use a JPEG, PNG, or WebP photo.');
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40 || !lines.every((l) => typeof l === 'string' && l.length <= 120)) return fail(400, 'Bad request.');

  // Only the competition's organizer may scan, and only so many per day (this also records the scan).
  const { data: allowed } = await supabase.rpc('claim_ballot_scan', { p_match: matchId });
  if (!allowed) return fail(403, 'Only the organizer can scan ballots for this trial, up to 300 a day.');

  const { data: m } = await supabase.from('matches').select('tournaments(scoring)').eq('id', matchId).maybeSingle();
  const max = Number((m as { tournaments?: { scoring?: { max?: number } } } | null)?.tournaments?.scoring?.max ?? 10);

  let response;
  try {
    response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(BallotReading) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: imageBase64 } },
            {
              type: 'text',
              text:
                'This is a photographed mock trial ballot. Read the score the judge gave each side on each line below, ' +
                `in this order. Plaintiff/prosecution and defense are usually separate columns. Scores are whole numbers from 1 to ${max}. ` +
                'If a line is unreadable or missing, use null rather than guessing, and say so in unreadable_notes.\n\nLines:\n' +
                (lines as string[]).map((l, i) => `${i + 1}. ${l}`).join('\n'),
            },
          ],
        },
      ],
    });
  } catch (e) {
    console.error('read-ballot failed', e instanceof Error ? e.message : e);
    return fail(502, 'Could not read this ballot right now. Enter it by hand.');
  }

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return fail(422, 'Could not read this ballot. Enter it by hand.');
  }
  return new Response(JSON.stringify(response.parsed_output), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
