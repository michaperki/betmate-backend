/* -------- Main Types -------- */

export type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

export type TopMoveData = string[];

export type MoveAnalysisData = {
  score: number,
  percentile: number,
  is_best_move: boolean
};

export type MicroserviceResponse<T> = {
  message: string,
  data: T,
};