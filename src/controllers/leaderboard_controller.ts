import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import leaderboardService from '../services/leaderboard_service';
import { ValidatedRequestWithJWT } from '../types/requests';
import { GetLeaderboardRequest, GetUserRankRequest } from '../validation/leaderboard';
import { handleFailure, handleSuccess } from './utils';

const getLeaderboardRequest: RequestHandler = async (req: ValidatedRequest<GetLeaderboardRequest>, res) => (
  leaderboardService
    .getLeaderboardSection(req.query.start, req.query.end, req.query.id)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

const getUserRankingRequest: RequestHandler = (req: ValidatedRequestWithJWT<GetUserRankRequest>, res) => (
  leaderboardService
    .getUserRanking(req.user._id, req.query.id)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

const getGameLeaderboardRequest: RequestHandler = async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!gameId) {
      return res.status(400).json({ error: 'Game ID is required' });
    }

    const rankings = await leaderboardService.generateGameLeaderboard(gameId);
    return res.status(200).json({ rankings });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate game leaderboard' });
  }
};

const leaderboardController = {
  getLeaderboardRequest,
  getUserRankingRequest,
  getGameLeaderboardRequest,
};

export default leaderboardController;
