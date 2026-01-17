import moveBadgeConfig from '../config/move_badges';
import openingService from './opening_service';

export type WDL = { white_win: number; draw: number; black_win: number };

export type TopMove = {
  move: string;
  score: number;
  percentile: number;
  is_best_move: boolean;
  // Optional fields from microservice (if enhanced)
  emoji?: string;
  emoji_confidence?: number;
  reason_codes?: string[];
};

export type MoveBadge = {
  badge_type: 'opening' | 'emoji' | 'none';
  badge_text: string | null; // opening name or emoji char
  badge_detail?: string | null; // e.g., family name or reason label
  badge_subtext?: string | null; // e.g., variation or ECO code for openings
  confidence?: number; // 0..1
  reason_codes?: string[];
  phase?: 'Opening' | 'Midgame' | 'Endgame';
  dominated_eval?: boolean;
};

const getPhase = (ply: number): 'Opening' | 'Midgame' | 'Endgame' => {
  if (ply < 12) return 'Opening';
  if (ply < 30) return 'Midgame';
  return 'Endgame';
};

const isDominated = (wdl: WDL): boolean => {
  const maxp = Math.max(wdl.white_win, wdl.black_win, wdl.draw);
  return moveBadgeConfig.dominated.enable && maxp >= moveBadgeConfig.dominated.probThreshold;
};

/**
 * Resolve a single badge for the current position, using precedence:
 * dominated -> opening -> emoji
 */
export function resolveBadgesForTopMoves(
  fen: string,
  ply: number,
  wdl: WDL,
  moves: TopMove[],
  sanHistory?: string[],
  overrideDominated?: boolean,
): {
  phase: 'Opening' | 'Midgame' | 'Endgame';
  dominated_eval: boolean;
  badges: Record<string, MoveBadge>; // keyed by move string
} {
  const phase = getPhase(ply);
  const dominated = (typeof overrideDominated === 'boolean') ? overrideDominated : isDominated(wdl);

  // Precompute best/second scores for fallback rules
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondScore = Number.NEGATIVE_INFINITY;
  for (const m of moves) {
    const s = Number(m.score || 0);
    if (s > bestScore) { secondScore = bestScore; bestScore = s; }
    else if (s > secondScore) { secondScore = s; }
  }

  const badges: Record<string, MoveBadge> = {};
  // Optional opening match (applies across all moves)
  let openingMatch: { name: string; family?: string; eco?: string; confidence: number } | null = null;
  if (moveBadgeConfig.opening.enable && phase === 'Opening' && Array.isArray(sanHistory) && sanHistory.length) {
    try {
      const match = openingService.findByMoves(sanHistory);
      // Slightly stricter confidence for showing opening names
      if (match && match.confidence >= 0.6) {
        openingMatch = { name: match.name, family: match.family, eco: match.eco, confidence: match.confidence };
      }
    } catch {
      // ignore
    }
  }

  for (const m of moves) {
    // Default badge
    badges[m.move] = {
      badge_type: 'none',
      badge_text: null,
      badge_detail: null,
      confidence: undefined,
      reason_codes: undefined,
      phase,
      dominated_eval: dominated,
    };

    // 1) Dominated: hide
    if (dominated) continue;

    // 2) Opening: if matched and in opening phase, prefer opening name for all moves
    if (openingMatch) {
      // Derive family + variation from name if needed
      const name = String(openingMatch.name || '');
      let family = openingMatch.family || '';
      let variation = '';
      if (!family && name.includes(':')) {
        const parts = name.split(':');
        family = parts[0].trim();
        variation = (parts.slice(1).join(':') || '').trim();
      } else if (!family) {
        family = name;
      }
      if (!variation && name.includes(':')) {
        variation = name.split(':').slice(1).join(':').trim();
      }
      const subtext = variation || (openingMatch.eco ? String(openingMatch.eco) : '') || null;
      badges[m.move] = {
        badge_type: 'opening',
        badge_text: family || name,
        badge_detail: null,
        badge_subtext: subtext,
        confidence: openingMatch.confidence,
        reason_codes: undefined,
        phase,
        dominated_eval: false,
      };
      continue;
    }

    // 3) Emoji from microservice (if present) with confidence gating
    let chosenEmoji: string | null = null;
    let chosenConf = 0;
    let chosenReasons: string[] | undefined = undefined;
    if (moveBadgeConfig.emoji.enable && m.emoji) {
      const conf = typeof m.emoji_confidence === 'number' ? m.emoji_confidence : 0;
      if (conf >= moveBadgeConfig.emoji.minConfidence) {
        chosenEmoji = m.emoji;
        chosenConf = conf;
        chosenReasons = m.reason_codes;
      }
    }

    // Fallback: derive minimal emoji from SAN + scores if none provided
    if (moveBadgeConfig.emoji.enable && !chosenEmoji) {
      try {
        const san = String(m.move || '');
        const isCheck = san.includes('+') || san.includes('#');
        const isCapture = san.includes('x');
        const isPromo = san.includes('=');
        // Only/initiative/blunder from score gaps
        const isBest = m.is_best_move === true;
        const onlyGap = Math.max(0, bestScore - secondScore);
        const gapToBest = Math.max(0, bestScore - Number(m.score || 0));
        // thresholds mirrored from microservice defaults
        const ONLY_GAP_CP = 120;
        const BLUNDER_GAP_CP = 350;
        const INITIATIVE_GAP_CP = 120;

        if (gapToBest >= BLUNDER_GAP_CP) {
          chosenEmoji = '🤡';
          chosenConf = 0.9;
          chosenReasons = ['large_eval_drop'];
        } else if (isBest && onlyGap >= ONLY_GAP_CP) {
          chosenEmoji = '🛡️';
          chosenConf = 0.85;
          chosenReasons = ['only_move'];
        } else if (isCheck) {
          chosenEmoji = '⚡';
          chosenConf = 0.8;
          chosenReasons = ['check'];
        } else if (isPromo) {
          chosenEmoji = '🔥';
          chosenConf = 0.85;
          chosenReasons = ['promotion'];
        } else if (isCapture) {
          chosenEmoji = '💥';
          chosenConf = 0.7;
          chosenReasons = ['capture'];
        } else if (isBest && onlyGap >= INITIATIVE_GAP_CP) {
          chosenEmoji = '🚀';
          chosenConf = 0.75;
          chosenReasons = ['initiative'];
        } else {
          chosenEmoji = '🍃';
          chosenConf = 0.55;
          chosenReasons = ['quiet'];
        }
      } catch {}
    }

    if (moveBadgeConfig.emoji.enable && chosenEmoji && chosenConf >= (moveBadgeConfig.emoji.minConfidence || 0)) {
      badges[m.move] = {
        badge_type: 'emoji',
        badge_text: chosenEmoji,
        badge_detail: chosenReasons && chosenReasons[0] ? chosenReasons[0] : null,
        confidence: chosenConf,
        reason_codes: chosenReasons,
        phase,
        dominated_eval: false,
      };
    }
  }

  return { phase, dominated_eval: dominated, badges };
}

export default { resolveBadgesForTopMoves };
