// Cloudflare Worker for app.mocktrialcentral.com.
// Everything is the static web app (./dist), except /api/ratings: the public school Elo leaderboard
// that other sites (courtroomdrills.com) show. It reads only what the app shows a signed-out visitor,
// using the public key, so it can never reveal anything the app doesn't.
import bundledHistory from '../src/data/history-law-school.json';
import type { Level, PastEvent } from '../src/lib/types';
import { allEvents, leaderboard, type LiveData } from './ratings';

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

// Same public values as .env.production (they ship inside the app). Env vars override them.
const SUPABASE_URL = 'https://zneehljxwnwskcotnskb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2lvcs0CiEjvtqnUZSGf7Xg_xqjMK_KR';
/** How long a computed leaderboard is reused. A closed competition shows up within this time. */
const CACHE_SECONDS = 300;
const LEVELS: Level[] = ['law_school', 'collegiate', 'high_school'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camel = <T>(rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [toCamel(k), v]))) as T[];

async function table(env: Env, name: string, query = ''): Promise<Record<string, unknown>[]> {
  const url = env.SUPABASE_URL || SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${name}?select=*${query}`, {
      headers: { apikey: key, Accept: 'application/json', Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function loadLive(env: Env, level: Level): Promise<LiveData> {
  const [pastEvents, tournaments, matches, published, teams, programs] = await Promise.all([
    table(env, 'past_events', `&level=eq.${level}`),
    table(env, 'tournaments', `&level=eq.${level}`),
    table(env, 'matches'),
    // Totals only, for published competitions: what the app's public standings use.
    table(env, 'published_results'),
    table(env, 'teams', `&level=eq.${level}`),
    table(env, 'programs', `&level=eq.${level}`),
  ]);
  return {
    pastEvents: camel(pastEvents),
    tournaments: camel(tournaments),
    matches: camel(matches),
    ballots: published.map((r) => ({
      id: String(r.id), matchId: String(r.match_id), judge: 'Ballot', judgeId: null, source: 'paper', sheet: null, comments: null,
      pScore: Number(r.p_score), dScore: Number(r.d_score), enteredBy: '', enteredAt: '',
    })) as LiveData['ballots'],
    teams: camel(teams),
    programs: camel(programs),
  };
}

function json(body: unknown, status = 200, maxAge = CACHE_SECONDS) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });
}

async function ratings(req: Request, env: Env, ctx: Ctx) {
  const url = new URL(req.url);
  const level = (url.searchParams.get('level') || 'law_school') as Level;
  if (!LEVELS.includes(level)) return json({ error: 'Unknown level' }, 400, 60);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 200);

  // One cached copy per level and limit, shared by every visitor.
  const cacheKey = new Request(`${url.origin}/api/ratings?level=${level}&limit=${limit}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const today = new Date().toISOString().slice(0, 10);
  const shipped = level === 'law_school' ? (bundledHistory as unknown as PastEvent[]) : [];
  let live: LiveData | null = null;
  try {
    live = await loadLive(env, level);
  } catch (e) {
    console.error('ratings: live data unavailable', e);
  }
  const board = leaderboard(level, allEvents(level, shipped, live, today), limit, !!live);
  // If the database was down, keep the fallback only briefly so live ratings come back quickly.
  const res = json(board, 200, live ? CACHE_SECONDS : 60);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/ratings' || pathname === '/api/ratings.json') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405, 0);
      try {
        return await ratings(req, env, ctx);
      } catch (e) {
        console.error('ratings failed', e);
        return json({ error: 'Ratings are unavailable right now.' }, 503, 0);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
