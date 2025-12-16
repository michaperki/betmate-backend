/* eslint-disable @typescript-eslint/naming-convention */
import { clamp } from './utils';

export type Outcome = 'white_win' | 'draw' | 'black_win';

export type RiskCaps = {
  bankroll: number;
  globalExposureCap: number; // absolute USDT
  perGameWorstCaseCap: number; // absolute USDT per game
  perOutcomeCap: Record<Outcome, number>; // absolute USDT per outcome per game
  perBetLiabilityCap: number; // absolute USDT per bet
  perPlayerPerGameCap: number; // absolute USDT per player per game
};

export type MarginCaps = {
  baseMargin: number; // for white/black
  drawExtraMargin: number; // added on top for draw
  maxOdds: Record<Outcome, number>;
};

export type ConfidenceTuning = {
  earlyMoveNum: number;
  capMultiplierEarly: number; // scale caps during early game
  extraMarginLowConf: number; // additional margin during low confidence
};

export type RiskConfig = RiskCaps & MarginCaps & ConfidenceTuning & {
  enabled: boolean;
  disableWdl: boolean;
  disableDraw: boolean;
};

// In-memory overrides that can be set via admin API (non-persistent)
const overrides: Partial<RiskConfig> = {};

const n = (v: any, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

const b = (v: any, d: boolean) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return typeof v === 'boolean' ? v : d;
};

export function getMargins(): MarginCaps {
  const baseMargin = clamp(n(process.env.REAL_WDL_MARGIN_BASE, 0.04), 0, 0.25);
  const drawExtraMargin = clamp(n(process.env.REAL_WDL_MARGIN_DRAW_EXTRA, 0.07), 0, 0.25);
  const maxOdds: Record<Outcome, number> = {
    white_win: clamp(n(process.env.REAL_WDL_MAX_ODDS_WHITE, 4.0), 1, 1000),
    black_win: clamp(n(process.env.REAL_WDL_MAX_ODDS_BLACK, 4.0), 1, 1000),
    draw: clamp(n(process.env.REAL_WDL_MAX_ODDS_DRAW, 6.0), 1, 1000),
  };
  const o = overrides as Partial<MarginCaps>;
  return {
    baseMargin: o.baseMargin ?? baseMargin,
    drawExtraMargin: o.drawExtraMargin ?? drawExtraMargin,
    maxOdds: o.maxOdds ?? maxOdds,
  };
}

export function getConfidence(): ConfidenceTuning {
  const earlyMoveNum = Math.max(0, n(process.env.REAL_WDL_CONF_EARLY_MOVE_NUM, 20));
  const capMultiplierEarly = clamp(n(process.env.REAL_WDL_CONF_CAP_MULT_EARLY, 0.5), 0.05, 1);
  const extraMarginLowConf = clamp(n(process.env.REAL_WDL_CONF_MARGIN_EXTRA, 0.03), 0, 0.25);
  const o = overrides as Partial<ConfidenceTuning>;
  return {
    earlyMoveNum: o.earlyMoveNum ?? earlyMoveNum,
    capMultiplierEarly: o.capMultiplierEarly ?? capMultiplierEarly,
    extraMarginLowConf: o.extraMarginLowConf ?? extraMarginLowConf,
  };
}

export function getCaps(): RiskCaps {
  const bankroll = Math.max(0, n(process.env.REAL_WDL_BANKROLL, 100000));
  const perGameWorstCaseCapPct = clamp(n(process.env.REAL_WDL_PER_GAME_CAP_PCT_OF_B, 0.005), 0, 1);
  const perOutcomeWhitePct = clamp(n(process.env.REAL_WDL_PER_OUTCOME_CAP_PCT_OF_GAME_WHITE, 0.5), 0, 1);
  const perOutcomeBlackPct = clamp(n(process.env.REAL_WDL_PER_OUTCOME_CAP_PCT_OF_GAME_BLACK, 0.5), 0, 1);
  const perOutcomeDrawPct = clamp(n(process.env.REAL_WDL_PER_OUTCOME_CAP_PCT_OF_GAME_DRAW, 0.35), 0, 1);
  const perBetPct = clamp(n(process.env.REAL_WDL_PER_BET_LIABILITY_CAP_PCT_OF_GAME, 0.10), 0, 1);
  const perPlayerPct = clamp(n(process.env.REAL_WDL_PER_PLAYER_PER_GAME_CAP_PCT_OF_GAME, 0.25), 0, 1);
  const globalExposurePct = clamp(n(process.env.REAL_WDL_GLOBAL_EXPOSURE_CAP_PCT, 0.15), 0, 1);

  const perGameWorstCaseCap = bankroll * perGameWorstCaseCapPct;
  const perOutcomeCap = {
    white_win: perGameWorstCaseCap * perOutcomeWhitePct,
    black_win: perGameWorstCaseCap * perOutcomeBlackPct,
    draw: perGameWorstCaseCap * perOutcomeDrawPct,
  } as Record<Outcome, number>;
  const perBetLiabilityCap = perGameWorstCaseCap * perBetPct;
  const perPlayerPerGameCap = perGameWorstCaseCap * perPlayerPct;
  const globalExposureCap = bankroll * globalExposurePct;

  const o = overrides as Partial<RiskCaps>;
  return {
    bankroll: o.bankroll ?? bankroll,
    globalExposureCap: o.globalExposureCap ?? globalExposureCap,
    perGameWorstCaseCap: o.perGameWorstCaseCap ?? perGameWorstCaseCap,
    perOutcomeCap: o.perOutcomeCap ?? perOutcomeCap,
    perBetLiabilityCap: o.perBetLiabilityCap ?? perBetLiabilityCap,
    perPlayerPerGameCap: o.perPlayerPerGameCap ?? perPlayerPerGameCap,
  };
}

export function getFeatureFlags() {
  const enabled = b(process.env.REAL_WDL_HOUSE_ENABLED, true);
  const disableDraw = b(process.env.REAL_WDL_DISABLE_DRAW, false);
  const disableWdl = b(process.env.REAL_WDL_DISABLE_WDL, false);
  const o = overrides as Partial<RiskConfig>;
  return {
    enabled: o.enabled ?? enabled,
    disableDraw: o.disableDraw ?? disableDraw,
    disableWdl: o.disableWdl ?? disableWdl,
  };
}

export function getRiskConfig(): RiskConfig {
  return {
    ...getCaps(),
    ...getMargins(),
    ...getConfidence(),
    ...getFeatureFlags(),
  } as RiskConfig;
}

export function updateOverrides(partial: Partial<RiskConfig>) {
  Object.assign(overrides, partial);
  return getRiskConfig();
}

export function clearOverrides() {
  for (const k of Object.keys(overrides)) delete (overrides as any)[k];
}

export function oddsFromP(p: number, outcome: Outcome, moveNum: number): number {
  const { baseMargin, drawExtraMargin, maxOdds } = getMargins();
  const { earlyMoveNum, extraMarginLowConf } = getConfidence();
  const isEarly = moveNum <= earlyMoveNum;
  const margin = baseMargin + (outcome === 'draw' ? drawExtraMargin : 0) + (isEarly ? extraMarginLowConf : 0);
  const raw = (1 - clamp(margin, 0, 0.9)) / Math.max(1e-6, p);
  const capped = Math.min(raw, maxOdds[outcome]);
  return Math.max(1, Math.round(capped * 100) / 100); // 2 dp
}

export function scaleCapsForConfidence(caps: RiskCaps, moveNum: number): RiskCaps {
  const { earlyMoveNum, capMultiplierEarly } = getConfidence();
  if (moveNum > earlyMoveNum) return caps;
  const s = clamp(capMultiplierEarly, 0.05, 1);
  return {
    bankroll: caps.bankroll,
    globalExposureCap: caps.globalExposureCap * s,
    perGameWorstCaseCap: caps.perGameWorstCaseCap * s,
    perOutcomeCap: {
      white_win: caps.perOutcomeCap.white_win * s,
      black_win: caps.perOutcomeCap.black_win * s,
      draw: caps.perOutcomeCap.draw * s,
    },
    perBetLiabilityCap: caps.perBetLiabilityCap * s,
    perPlayerPerGameCap: caps.perPlayerPerGameCap * s,
  };
}

