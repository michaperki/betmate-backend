export type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

export type WDLResponse = {
  message: string,
  data: WDLData | null,
  error: string | null
};
