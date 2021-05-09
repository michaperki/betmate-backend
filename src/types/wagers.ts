import { WagerDoc, WagerOutcomes } from 'types/models';

export type UserWinnings = Record<string, number>;
export type WagerResults = Record<WagerOutcomes, string[]>;
export type WinningsFn = (wagers: WagerDoc[], correctMove: string) => UserWinnings;
