import HttpError from '../helpers/errors';
import { Leaderboard } from '../models';
import { Types } from 'mongoose';
import { LeaderboardDoc, LeaderboardSection, Rank } from '../types/models/leaderboard';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import wagerService from './wager_service';

const createLeaderboard = async (ranks: Rank[], userRanks: Record<string, Rank>): Promise<LeaderboardDoc> => (
  new Leaderboard({
    rankings: ranks,
    user_ranks: userRanks,
    rankings_size: ranks.length,
  })
    .save()
    .catch(dbErrorHandler)
);

const getLeaderboardSection = (start: number, end: number, id?: Types.ObjectId | string): Promise<LeaderboardSection> => (
  Leaderboard
    .findOne(id ? { _id: id } : undefined)
    .sort({ created_at: -1 })
    .select(['rankings', 'rankings_size', '_id'])
    .slice('rankings', [start, end - start])
    .then(dbNullDocHandler)
    .then((doc): LeaderboardSection => {
      // Ensure _id is included by explicitly including it in the return type
      return {
        _id: doc._id,
        rankings: doc.rankings,
        rankings_size: doc.rankings_size
      };
    })
    .catch(dbErrorHandler)
);

const getUserRanking = (userID: Types.ObjectId | string, id?: Types.ObjectId | string): Promise<Rank> => (
  Leaderboard
    .findOne(id ? { _id: id } : undefined)
    .sort({ created_at: -1 })
    .select(`user_ranks.${userID}`)
    .then(dbNullDocHandler)
    .then((doc) => {
      const rank = doc.user_ranks.get(String(userID));
      if (!rank) throw new HttpError(400, ['User not found in rankings']);
      return rank;
    })
    .catch(dbErrorHandler)
);

const generateLeaderboard = async (): Promise<LeaderboardDoc | null> => {
  try {
    // const now = new Date();
    const startOfMonth = new Date(2021, 4, 1); // new Date(now.getFullYear(), now.getMonth(), 1);
    const wagers = await wagerService.getPopulatedWagers({ created_at: { $gte: startOfMonth }, resolved: true }, 'better_id');

    const winningsByUser = wagers.reduce((acc, w) => {
      const userID = String(w.better_id._id);
      // Calculate winnings, ensuring we don't get NaN by using default values
      const currentWinnings = acc[userID]?.winnings ?? 0;
      const wagerWinnings = typeof w.winnings === 'number' && !isNaN(w.winnings) ? w.winnings : 0;
      const wagerAmount = typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;
      const totalWinnings = currentWinnings + wagerWinnings - wagerAmount;

      // Extract name components
      const firstName = w.better_id.first_name ? w.better_id.first_name.trim() : '';
      const lastName = w.better_id.last_name ? w.better_id.last_name.trim() : '';
      const email = w.better_id.email || '';

      // Build display name with priority:
      // 1. First + Last name if both exist
      // 2. Just First name if it exists
      // 3. Just Last name if it exists
      // 4. Email username (part before @) as fallback
      let displayName = '';

      if (firstName && lastName) {
        displayName = `${firstName} ${lastName}`;
      } else if (firstName) {
        displayName = firstName;
      } else if (lastName) {
        displayName = lastName;
      } else if (email) {
        displayName = email.split('@')[0];
      }

      return {
        ...acc,
        [userID]: {
          user_id: Types.ObjectId(userID),
          user_name: displayName,
          winnings: totalWinnings,
        },
      };
    }, {} as Record<string, Omit<Rank, 'rank'>>);

    // Filter out any records with NaN winnings to prevent sorting errors
    const validWinnings = Object.values(winningsByUser).filter(w => {
      const win = w as Omit<Rank, 'rank'>;
      return typeof win.winnings === 'number' && !isNaN(win.winnings);
    });

    const sortedWinnings: Rank[] = (
      validWinnings
        .sort((a, b) => {
          // Safely compare winnings values, handling any potential NaN
          const aTyped = a as Omit<Rank, 'rank'>;
          const bTyped = b as Omit<Rank, 'rank'>;
          const bWin = typeof bTyped.winnings === 'number' && !isNaN(bTyped.winnings) ? bTyped.winnings : 0;
          const aWin = typeof aTyped.winnings === 'number' && !isNaN(aTyped.winnings) ? aTyped.winnings : 0;
          return bWin - aWin;
        })
        .map((data, i) => ({
          ...(data as Omit<Rank, 'rank'>),
          rank: i + 1,
        }))
    );

    const userRanks = (
      sortedWinnings
        .reduce((acc, w) => ({
          ...acc,
          [String(w.user_id)]: w,
        }), {} as Record<string, Rank>)
    );

    return createLeaderboard(sortedWinnings, userRanks);
  } catch (error) {
    return null;
  }
};

const clearLeaderboards = async (): Promise<boolean> => {
  try {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    await Leaderboard.deleteMany({ created_at: { $lte: lastWeek } });
    return true;
  } catch (error) {
    return false;
  }
};

const generateGameLeaderboard = async (gameId: Types.ObjectId | string): Promise<Rank[]> => {
  try {
    // Get all resolved wagers for this specific game
    const wagers = await wagerService.getPopulatedWagers(
      { game_id: new Types.ObjectId(String(gameId)), resolved: true },
      'better_id'
    );

    const winningsByUser = wagers.reduce((acc, w) => {
      const userID = String(w.better_id._id);
      // Calculate winnings for this game only
      const currentWinnings = acc[userID]?.winnings ?? 0;
      const wagerWinnings = typeof w.winnings === 'number' && !isNaN(w.winnings) ? w.winnings : 0;
      const wagerAmount = typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;
      const totalWinnings = currentWinnings + wagerWinnings - wagerAmount;

      // Extract name components
      const firstName = w.better_id.first_name ? w.better_id.first_name.trim() : '';
      const lastName = w.better_id.last_name ? w.better_id.last_name.trim() : '';
      const email = w.better_id.email || '';

      // Build display name with priority:
      // 1. First + Last name if both exist
      // 2. Just First name if it exists
      // 3. Just Last name if it exists
      // 4. Email username (part before @) as fallback
      let displayName = '';

      if (firstName && lastName) {
        displayName = `${firstName} ${lastName}`;
      } else if (firstName) {
        displayName = firstName;
      } else if (lastName) {
        displayName = lastName;
      } else if (email) {
        displayName = email.split('@')[0];
      }

      return {
        ...acc,
        [userID]: {
          user_id: Types.ObjectId(userID),
          user_name: displayName,
          winnings: totalWinnings,
        },
      };
    }, {} as Record<string, Omit<Rank, 'rank'>>);

    // Filter out any records with NaN winnings
    const validWinnings = Object.values(winningsByUser).filter(w => {
      const win = w as Omit<Rank, 'rank'>;
      return typeof win.winnings === 'number' && !isNaN(win.winnings);
    });

    // Sort and rank the users for this game
    const sortedWinnings: Rank[] = (
      validWinnings
        .sort((a, b) => {
          const aTyped = a as Omit<Rank, 'rank'>;
          const bTyped = b as Omit<Rank, 'rank'>;
          const bWin = typeof bTyped.winnings === 'number' && !isNaN(bTyped.winnings) ? bTyped.winnings : 0;
          const aWin = typeof aTyped.winnings === 'number' && !isNaN(aTyped.winnings) ? aTyped.winnings : 0;
          return bWin - aWin;
        })
        .map((data, i) => ({
          ...(data as Omit<Rank, 'rank'>),
          rank: i + 1,
        }))
    );

    return sortedWinnings;
  } catch (error) {
    return [];
  }
};

const leaderboardService = {
  createLeaderboard,
  getLeaderboardSection,
  getUserRanking,
  generateLeaderboard,
  generateGameLeaderboard,
  clearLeaderboards,
};

export default leaderboardService;
