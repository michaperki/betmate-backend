import type { Namespace } from 'socket.io';

let chessNs: Namespace | null = null;

export const setChessNamespace = (ns: Namespace) => { chessNs = ns; };
export const getChessNamespace = (): Namespace | null => chessNs;

