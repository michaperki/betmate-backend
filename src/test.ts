import axios from 'axios';
import ndjson from 'ndjson';
import { PartialWithRequired } from 'types';
import { LichessGame, StreamData } from 'types/lichess';
import {
  AnonMoveWager, ChessDoc, GameStatus, MoveData,
} from 'types/models/chess';
import { matchesSchema } from 'validation';
import { StreamEndSchema, StreamMoveSchema, StreamStartSchema } from 'validation/lichess';
import { Types } from 'mongoose';
import { Chess } from 'chess.js';
import { cancelCriticalMoveWagers, resolveCriticalMoveWagers } from 'helpers/resolve_bets';
import { microservice } from 'services';
// import { resolveCriticalMoveWagers } from 'helpers/resolve_bets';

const LICHESS_ROOT = 'https://lichess.org/api';

const numMoves = (g: LichessGame) => g.moves.split(' ').length;

const takeLess = <D>(fn: (d: D) => number) => (a: D, b: D): D => (fn(a) > fn(b) ? b : a);

const getOutcome = (o: string): GameStatus => (
  // eslint-disable-next-line no-nested-ternary
  o === 'white' ? GameStatus.WHITE_WIN
    : o === 'black' ? GameStatus.BLACK_WIN
      : GameStatus.DRAW
);

const getStream = async (id: string, startData: PartialWithRequired<ChessDoc, 'player_white' | 'player_black'>) => {
  const { data } = await axios({
    method: 'GET',
    url: `${LICHESS_ROOT}/stream/game/${id}`,
    responseType: 'stream',
  });

  console.log('creating game with', startData);
  const moveHist: MoveData[] = [];
  const gameTime = 600;
  let liveTopMoves: string[] = [];
  const game = new Chess();
  let turnsToIgnore = 0;

  data.pipe(ndjson.parse())
    .on('data', (d: StreamData) => {
      if (matchesSchema(StreamStartSchema, d)) {
        turnsToIgnore = d.turns - 1;
        console.log('ignore until', d.turns, d.fen);
      } else if (matchesSchema(StreamMoveSchema, d)) {
        console.log('is move', d);
        if (d.lm === undefined) return;
        const move = game.move(d.lm, { sloppy: true });
        if (!move) return;

        const { color, from, to } = move;

        const isWhite = color === 'w';

        moveHist.push({
          from,
          to,
          san: d.lm,
          is_white: isWhite,
          time: isWhite ? d.wc : d.bc,
        });

        console.log(move);

        // (liveTopMoves.length > 0
        //   ? resolveCriticalMoveWagers('', game.history(), liveTopMoves)
        //   : cancelCriticalMoveWagers('', game.history()))
        //   .then((wagerResults) => Object.entries(wagerResults).forEach(([uid, wagers]) => console.log(uid, wagers)));

        liveTopMoves = [];

        if (turnsToIgnore === 0) {
          const oddsPromise = microservice
            .getWDL(game.fen(), Math.floor((d.wc / gameTime) * 180), Math.floor((d.bc / gameTime) * 180))
            .catch(() => ({ white_win: 0.0, draw: 0.0, black_win: 0.0 }));
          const topMovesPromise = microservice
            .getTopMoves(game.fen(), 3)
            .catch(() => []);

          Promise.all([oddsPromise, topMovesPromise]).then(([odds, topMoves]) => {
            liveTopMoves = topMoves;
            const oddsUpdate = {
              odds,
              pool_wagers: {
                move: {
                  wagers: [] as unknown as Types.Array<AnonMoveWager>,
                  options: topMoves as Types.Array<string>,
                },
              },
            };
            console.log('odds update', oddsUpdate);

            // Broadcast new odds, save to database
            // socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
            // chessService.updateChessGame(gameDoc._id, oddsUpdate);
          });
        } else {
          turnsToIgnore -= 1;
        }

        const update = {
          state: d.fen,
          move_hist: [...moveHist] as Types.Array<MoveData>,
          time_white: d.wc,
          time_black: d.bc,
          pool_wagers: {
            move: {
              wagers: [] as unknown as Types.Array<AnonMoveWager>,
              options: [] as unknown as Types.Array<string>,
            },
          },
        };
        console.log('update with', update.state);
      } else if (matchesSchema(StreamEndSchema, d)) {
        console.log('is end');
        // const completeFields = {
        //   game_status: getOutcome(d.winner),
        //   complete: true,
        // };
        // console.log('complete with', completeFields);
      } else {
        console.log('FAIL', d);
      }
    })
    .on('end', () => {
      console.log(id, 'ended');
    });
};

const findStream = async () => {
  try {
    const { data } = await axios({
      method: 'GET',
      url: `${LICHESS_ROOT}/tv/bullet`,
      headers: { Accept: 'application/x-ndjson' },
      params: { nb: 100 },
    });

    const games: LichessGame[] = data
      .split('\n')
      .filter((s: string) => s.length > 0)
      .map(JSON.parse);

    const selectedGame = games.reduce(takeLess(numMoves));

    console.log(selectedGame);

    const gameFields = {
      player_white: {
        name: selectedGame.players.white.user.name,
        elo: selectedGame.players.white.rating,
      },
      player_black: {
        name: selectedGame.players.black.user.name,
        elo: selectedGame.players.black.rating,
      },
      time_format: `${selectedGame.clock.totalTime}+${selectedGame.clock.increment}`,
      time_white: selectedGame.clock.initial,
      time_black: selectedGame.clock.initial,
    };

    getStream(selectedGame.id, gameFields);
  } catch (error) {
    console.log(error);
  }
};

findStream();
