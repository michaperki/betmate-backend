import HttpError from 'helpers/errors';
import { Leaderboard } from 'models';
import { Types } from 'mongoose';
import { LeaderboardDoc, LeaderboardSection, Rank } from 'types/models/leaderboard';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import wagerService from './wager_service';

const createLeaderboard = async (ranks: Rank[]): Promise<LeaderboardDoc> => (
  new Leaderboard({ rankings: ranks })
    .save()
    .catch(dbErrorHandler)
);

const getLeaderboard = (id?: Types.ObjectId | string): Promise<LeaderboardDoc> => (
  Leaderboard
    .findOne(id ? { _id: id } : undefined)
    .sort({ created_at: -1 })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

const getLeaderboardSection = (start: number, end: number, id?: Types.ObjectId | string): Promise<LeaderboardSection> => (
  getLeaderboard(id)
    .then((doc) => ({
      rankings: doc.rankings.slice(start, end),
      id: doc._id,
      rankings_size: doc.rankings.length,
    }))
);

const getUserRanking = (userID: Types.ObjectId | string, id?: Types.ObjectId | string): Promise<Rank> => (
  getLeaderboard(id)
    .then((doc) => doc.rankings.find((r) => r.user_id.equals(userID)))
    .then((rank) => {
      if (!rank) throw new HttpError(400, ['User not found in rankings']);
      return rank;
    })
);

const generateLeaderboard = async (): Promise<LeaderboardDoc | null> => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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

    return createLeaderboard(sortedWinnings);
  } catch (error) {
    return null;
  }
};

const leaderboardService = {
  createLeaderboard,
  getLeaderboard,
  getLeaderboardSection,
  getUserRanking,
  generateLeaderboard,
};

export default leaderboardService;
