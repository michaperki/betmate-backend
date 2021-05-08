import { WagerDoc } from 'types/models';

export type WinningsFn = (wagers: WagerDoc[], correctMove: string) => Record<string, number>;
