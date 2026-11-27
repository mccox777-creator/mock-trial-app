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

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Only a competition's organizer may scan its ballots.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { matchId, imageBase64, mediaType, lines } = await req.json();
  const { data: match } = await supabase.from('matches').select('tournament_id').eq('id', matchId).maybeSingle();
  const { data: isDirector } = match ? await supabase.rpc('is_director', { t_id: match.tournament_id }) : { data: false };
  if (!isDirector) return new Response(JSON.stringify({ error: 'Only the organizer can scan ballots.' }), { status: 403, headers: cors });

  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(BallotReading) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text:
              'This is a photographed mock trial ballot. Read the score the judge gave each side on each line below, ' +
              'in this order. Plaintiff/prosecution and defense are usually separate columns. Scores are whole numbers, usually 1 to 10. ' +
              'If a line is unreadable or missing, use null rather than guessing, and say so in unreadable_notes.\n\nLines:\n' +
              (lines as string[]).map((l, i) => `${i + 1}. ${l}`).join('\n'),
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return new Response(JSON.stringify({ error: 'Could not read this ballot. Enter it by hand.' }), { status: 422, headers: cors });
  }
  return new Response(JSON.stringify(response.parsed_output), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
