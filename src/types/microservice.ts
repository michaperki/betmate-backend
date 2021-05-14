export type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

export type TopMoveData = string[];

export type MicroserviceResponse<T> = {
  message: string,
  data: T | null,
  error: string | null
};
