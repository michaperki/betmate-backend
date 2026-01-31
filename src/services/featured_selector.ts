import { LichessGame, LichessStreamer } from '../types/lichess';
import lichessService from './lichess_service';
import logger from '../helpers/logger';
import featuredPlayers from '../config/featured_players.json';

type Channel = 'classical' | 'rapid' | 'blitz';

// Lightweight known players boost; can be extended via env FEATURED_KNOWN_PLAYERS="carlsen,nakamura,..."
const DEFAULT_KNOWN: string[] = [
  'carlsen', 'magnuscarlsen', 'drnykterstein', 'hikaru', 'nakamura', 'firouzja2003', 'firouzja', 'alirezafirouzja',
  'nepomniachtchi', 'dingleiren', 'praggnanandhaa', 'gukesh', 'anishgiri', 'fabianocaruana', 'wesleyso', 'aryangiri',
  'daniildubov', 'andrejessin', 'aleksandragoryachkina', 'katerynachelsea'
].map((s) => s.toLowerCase());

function envKnownPlayers(): string[] {
  const raw = String(process.env.FEATURED_KNOWN_PLAYERS || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function fileKnownPlayers(): string[] {
  try {
    const list = (featuredPlayers as any)?.known;
    if (Array.isArray(list)) return list.map((s) => String(s).toLowerCase());
  } catch {}
  return [];
}

function moveCount(g: LichessGame): number {
  try { return (g.moves || '').split(' ').filter(Boolean).length; } catch { return 0; }
}

function maxRating(g: LichessGame): number {
  const w = Number(g.players?.white?.rating || 0);
  const b = Number(g.players?.black?.rating || 0);
  return Math.max(w, b);
}

function hasTitle(g: LichessGame, titles: string[]): boolean {
  const tW = (g.players?.white?.user?.title || '').toUpperCase();
  const tB = (g.players?.black?.user?.title || '').toUpperCase();
  return titles.includes(tW) || titles.includes(tB);
}

function anyKnown(g: LichessGame, known: Set<string>): boolean {
  const idW = (g.players?.white?.user?.id || '').toLowerCase();
  const idB = (g.players?.black?.user?.id || '').toLowerCase();
  const nW = (g.players?.white?.user?.name || '').toLowerCase();
  const nB = (g.players?.black?.user?.name || '').toLowerCase();
  return known.has(idW) || known.has(idB) || known.has(nW) || known.has(nB);
}

function timeScore(initialMinutes: number): number {
  // Hard drop bullet; prefer 15–45, classical still high
  if (initialMinutes < 3) return 0;             // Bullet
  if (initialMinutes < 5) return 0.3;           // Short blitz
  if (initialMinutes < 10) return 0.6;          // Longer blitz/short rapid
  if (initialMinutes <= 45) return 1.0;         // Sweet spot 15–45
  if (initialMinutes <= 120) return 0.9;        // Classical
  return 0.7;                                    // Super-long
}

function stageScore(moves: number): number {
  if (moves < 6) return 0.7;    // opening just started
  if (moves <= 30) return 1.0;  // opening→midgame sweet spot
  if (moves <= 40) return 0.85; // late midgame
  return 0.5;                    // likely endgame/cleanup
}

function playerScore(g: LichessGame, known: Set<string>): number {
  const r = maxRating(g);
  let s = 0;
  if (r >= 2700) s += 1.0; else if (r >= 2600) s += 0.8; else if (r >= 2400) s += 0.5; else s += 0.2;
  if (hasTitle(g, ['GM', 'WGM'])) s += 0.2; else if (hasTitle(g, ['IM', 'WIM'])) s += 0.1;
  if (anyKnown(g, known)) s += 0.2;
  return Math.min(s, 1.3); // cap
}

function streamerBonus(g: LichessGame, streamers: LichessStreamer[]): number {
  try {
    const ids = new Set((streamers || []).map((s) => s.id.toLowerCase()));
    const w = (g.players?.white?.user?.id || '').toLowerCase();
    const b = (g.players?.black?.user?.id || '').toLowerCase();
    return (ids.has(w) || ids.has(b)) ? 0.1 : 0;
  } catch { return 0; }
}

function weightFromEnv(name: string, def: number): number {
  const raw = process.env[name];
  // Treat missing or empty env as "unset" and fall back to default
  if (raw == null || String(raw).trim() === '') return def;
  const v = Number(raw);
  return Number.isFinite(v) ? v : def;
}

type Weights = { time: number; stage: number; player: number; stream: number };

function currentWeights(): Weights {
  return {
    time: weightFromEnv('FEATURED_W_TIME', 0.5),
    stage: weightFromEnv('FEATURED_W_STAGE', 0.2),
    player: weightFromEnv('FEATURED_W_PLAYER', 0.25),
    stream: weightFromEnv('FEATURED_W_STREAM', 0.05),
  };
}

export interface CandidateScore {
  id: string;
  game: LichessGame;
  score: number;
  components: { sTime: number; sStage: number; sPlayer: number; sStream: number; penalty: number };
  summary: { initMin: number; moves: number; maxRating: number; titles: string[]; known: boolean; streamer: boolean };
}

async function fetchCandidates(): Promise<{ candidates: LichessGame[]; streamers: LichessStreamer[] }> {
  const [classical, rapid, blitz, streamers] = await Promise.all([
    lichessService.getTvGames('classical', 20).catch(() => []),
    lichessService.getTvGames('rapid', 20).catch(() => []),
    lichessService.getTvGames('blitz', 12).catch(() => []),
    lichessService.getActiveStreamers().catch(() => []),
  ]);
  const all = [...classical, ...rapid, ...blitz];
  const byId = new Map<string, LichessGame>();
  for (const g of all) if (g?.id) byId.set(g.id, g);
  return { candidates: Array.from(byId.values()), streamers };
}

function titlesOf(g: LichessGame): string[] {
  const t: string[] = [];
  const w = (g.players?.white?.user?.title || '').toUpperCase();
  const b = (g.players?.black?.user?.title || '').toUpperCase();
  if (w) t.push(w);
  if (b) t.push(b);
  return t;
}

export async function computeFeaturedCandidates(): Promise<{ weights: Weights; scored: CandidateScore[]; generated_at: string }>{
  const weights = currentWeights();
  const known = new Set<string>([...DEFAULT_KNOWN, ...fileKnownPlayers(), ...envKnownPlayers()]);
  const { candidates, streamers } = await fetchCandidates();
  if (!candidates.length) throw new Error('No TV candidates available');

  const scored: CandidateScore[] = candidates.map((g) => {
    const initMin = Math.max(0, Math.round((g.clock?.initial || 0) / 60));
    const moves = moveCount(g);
    const sTime = timeScore(initMin);
    const sStage = stageScore(moves);
    const sPlayer = playerScore(g, known);
    const sStream = streamerBonus(g, streamers);
    const penalty = (initMin < 3 ? 1 : 0) + (moves > 50 ? 0.2 : 0);
    const score = weights.time * sTime + weights.stage * sStage + weights.player * sPlayer + weights.stream * sStream - penalty;
    return {
      id: g.id,
      game: g,
      score,
      components: { sTime, sStage, sPlayer, sStream, penalty },
      summary: {
        initMin,
        moves,
        maxRating: maxRating(g),
        titles: titlesOf(g),
        known: anyKnown(g, known),
        streamer: streamerBonus(g, streamers) > 0,
      }
    };
  }).sort((a, b) => b.score - a.score);

  return { weights, scored, generated_at: new Date().toISOString() };
}

export async function selectFeaturedGame(): Promise<LichessGame> {
  const { weights, scored, generated_at } = await computeFeaturedCandidates();
  const top = scored[0];

  // Structured logs: summary and top candidates
  logger.log({ level: 'info', event: 'featured_selector_summary', context: { generated_at, candidates: scored.length, weights } });
  for (const c of scored.slice(0, 10)) {
    logger.log({ level: 'info', event: 'featured_candidate_scored', context: {
      id: c.id,
      score: Number(c.score.toFixed(4)),
      components: c.components,
      initMin: c.summary.initMin,
      moves: c.summary.moves,
      maxRating: c.summary.maxRating,
      titles: c.summary.titles,
      known: c.summary.known,
      streamer: c.summary.streamer,
    } });
  }
  logger.log({ level: 'info', event: 'featured_selected', context: { id: top.id, score: Number(top.score.toFixed(4)) } });

  return top.game;
}

export default { selectFeaturedGame, computeFeaturedCandidates };
