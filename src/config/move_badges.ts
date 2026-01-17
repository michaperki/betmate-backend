export type BadgeConfig = {
  // Opening phase gating
  opening: {
    enable: boolean;
    maxPly: number; // e.g., ≤ 16 ply
    evalWindowCp: number; // not used yet; for future eval-based opening gate
  };
  // Dominated positions gating
  dominated: {
    enable: boolean;
    probThreshold: number; // e.g., 0.95
    minPersistencePlies: number; // recommended N plies; backend may enforce statefully later
  };
  // Emoji confidence thresholds (microservice also computes; backend can gate display)
  emoji: {
    enable: boolean;
    minConfidence: number; // hide below this; fallback to quiet/none
  };
};

export const moveBadgeConfig: BadgeConfig = {
  opening: {
    enable: true,
    maxPly: Number(process.env.OPENING_MAX_PLY || 16),
    evalWindowCp: Number(process.env.OPENING_EVAL_WINDOW_CP || 70),
  },
  dominated: {
    enable: true,
    probThreshold: Number(process.env.DOMINATED_PROB_THRESHOLD || 0.95),
    minPersistencePlies: Number(process.env.DOMINATED_MIN_PLIES || 2),
  },
  emoji: {
    enable: true,
    minConfidence: Number(process.env.EMOJI_MIN_CONFIDENCE || 0.65),
  },
};

export default moveBadgeConfig;

