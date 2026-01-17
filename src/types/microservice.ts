/* -------- Main Types -------- */

export type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

export type TopMoveData = Array<{
  move: string,
  score: number,
  percentile: number,
  is_best_move: boolean,
  // Optional enhanced fields from microservice
  emoji?: string,
  emoji_confidence?: number,
  reason_codes?: string[],
  only_gap_cp?: number | null,
  gap_to_best_cp?: number | null,
}>;

export type MoveAnalysisData = {
  move: string,
  score: number,
  percentile: number,
  is_best_move: boolean
};

export type MicroserviceResponse<T> = {
  message: string,
  data: T,
};
