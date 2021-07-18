import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import HttpError from 'helpers/errors';
import leaderboardService from 'services/leaderboard_service';
import { RequestWithJWT } from 'types/requests';
import { GetLeaderboardRequest } from 'validation/leaderboard';
import { handleFailure, handleSuccess } from './utils';

const getLeaderboardRequest: RequestHandler = async (req: ValidatedRequest<GetLeaderboardRequest>, res) => (
  leaderboardService
    .getLeaderboardSection(req.query.start, req.query.end, req.query.id)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

const getUserRankingRequest: RequestHandler = (req: RequestWithJWT, res) => (
  leaderboardService
    .getUserRanking(req.user._id, req.query.id as string)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

const createLeaderboard: RequestHandler = async (req, res) => {
  try {
    const leaderboard = await leaderboardService.generateLeaderboard();
    if (!leaderboard) throw new HttpError(500, ['Error making leaderboard']);
    handleSuccess(res)(leaderboard);
  } catch (error) {
    handleFailure(res)(error);
  }
};

const leaderboardController = {
  getLeaderboardRequest,
  getUserRankingRequest,
  createLeaderboard,
};

export default leaderboardController;
