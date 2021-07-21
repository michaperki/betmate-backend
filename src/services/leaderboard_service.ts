import HttpError from 'helpers/errors';
import { Leaderboard } from 'models';
import { Types } from 'mongoose';
import { LeaderboardDoc, LeaderboardSection, Rank } from 'types/models/leaderboard';
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
    .select(['rankings', 'rankings_size'])
    .slice('rankings', [start, end - start])
    .then(dbNullDocHandler)
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
      return {
        ...acc,
        [userID]: {
          user_id: Types.ObjectId(userID),
          user_name: w.better_id.full_name,
          winnings: (acc[userID]?.winnings ?? 0) + w.winnings - w.amount,
        },
      };
    }, {} as Record<string, Omit<Rank, 'rank'>>);

    const sortedWinnings: Rank[] = (
      Object
        .values(winningsByUser)
        .sort((a, b) => b.winnings - a.winnings)
        .map((data, i) => ({
          ...data,
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

const leaderboardService = {
  createLeaderboard,
  getLeaderboardSection,
  getUserRanking,
  generateLeaderboard,
};

export default leaderboardService;
