export type WDLKeys = 'white' | 'draw' | 'black';

export type QState = Record<WDLKeys, number>;
export type PState = Record<WDLKeys, number>;

const EPS = 1e-9;

// Compute normalized LMSR prices from q and b
export function lmsrPrices(q: QState, b: number): PState {
  const exps = [q.white, q.draw, q.black].map((v) => Math.exp(v / Math.max(EPS, b)));
  const Z = exps[0] + exps[1] + exps[2] || EPS;
  return {
    white: exps[0] / Z,
    draw: exps[1] / Z,
    black: exps[2] / Z,
  };
}

// Convert target probabilities into an LMSR q state that yields those prices
// Any common offset cancels; we use q_i = b * ln(p_i)
export function probsToQ(p: PState, b: number): QState {
  const pw = Math.max(EPS, p.white);
  const pd = Math.max(EPS, p.draw);
  const pb = Math.max(EPS, p.black);
  return {
    white: b * Math.log(pw),
    draw: b * Math.log(pd),
    black: b * Math.log(pb),
  };
}

// Utility to renormalize probabilities and clamp
export function normalizeP(p: Partial<PState>): PState {
  const pw = Math.max(EPS, Number(p.white ?? 0));
  const pd = Math.max(EPS, Number(p.draw ?? 0));
  const pb = Math.max(EPS, Number(p.black ?? 0));
  const S = pw + pd + pb;
  if (!isFinite(S) || S <= 0) {
    return { white: 1 / 3, draw: 1 / 3, black: 1 / 3 };
  }
  return { white: pw / S, draw: pd / S, black: pb / S };
}

