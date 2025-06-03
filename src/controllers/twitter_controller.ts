/**
 * Twitter Controller
 * Handles Twitter-related API endpoints
 */

import { Request, Response } from 'express';
import twitterService from '../services/twitter_service';
import logger from '../helpers/axiom_logger';

/**
 * Check if Twitter API is properly configured
 */
export const checkTwitterConfig = (req: Request, res: Response) => {
  const isConfigured = twitterService.isConfigured();
  return res.status(200).json({
    isConfigured,
    message: isConfigured
      ? 'Twitter API is configured'
      : 'Twitter API is not configured. Please set the required environment variables.'
  });
};

/**
 * Get the status of the tweet queue
 */
export const getTweetQueueStatus = (req: Request, res: Response) => {
  try {
    const queueStatus = twitterService.getTweetQueueStatus();

    return res.status(200).json({
      success: true,
      queueStatus
    });
  } catch (error) {
    logger.error('Error in getTweetQueueStatus controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Post a tweet about a new game
 */
export const tweetNewGame = async (req: Request, res: Response) => {
  try {
    const { gameId, whitePlayer, blackPlayer, timeControl } = req.body;

    if (!gameId || !whitePlayer || !blackPlayer || !timeControl) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['gameId', 'whitePlayer', 'blackPlayer', 'timeControl']
      });
    }

    if (!twitterService.isConfigured()) {
      return res.status(500).json({
        error: 'Twitter API is not configured',
        message: 'Please set the required Twitter API environment variables'
      });
    }

    const result = await twitterService.tweetNewGame(
      gameId,
      whitePlayer,
      blackPlayer,
      timeControl
    );

    if (!result) {
      return res.status(500).json({ error: 'Failed to queue tweet' });
    }

    return res.status(200).json({
      success: true,
      message: 'Tweet queued successfully',
      queueId: result.id
    });
  } catch (error) {
    logger.error('Error in tweetNewGame controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Post a tweet about game results
 */
export const tweetGameResult = async (req: Request, res: Response) => {
  try {
    const { gameId, whitePlayer, blackPlayer, result } = req.body;

    if (!gameId || !whitePlayer || !blackPlayer || !result) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['gameId', 'whitePlayer', 'blackPlayer', 'result']
      });
    }

    if (!twitterService.isConfigured()) {
      return res.status(500).json({
        error: 'Twitter API is not configured',
        message: 'Please set the required Twitter API environment variables'
      });
    }

    const tweetResult = await twitterService.tweetGameResult(
      gameId,
      whitePlayer,
      blackPlayer,
      result
    );

    if (!tweetResult) {
      return res.status(500).json({ error: 'Failed to queue tweet' });
    }

    return res.status(200).json({
      success: true,
      message: 'Tweet queued successfully',
      queueId: tweetResult.id
    });
  } catch (error) {
    logger.error('Error in tweetGameResult controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Post a tweet about a significant betting event
 */
export const tweetBettingEvent = async (req: Request, res: Response) => {
  try {
    const { gameId, message } = req.body;

    if (!gameId || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['gameId', 'message']
      });
    }

    if (!twitterService.isConfigured()) {
      return res.status(500).json({
        error: 'Twitter API is not configured',
        message: 'Please set the required Twitter API environment variables'
      });
    }

    const result = await twitterService.tweetBettingEvent(gameId, message);

    if (!result) {
      return res.status(500).json({ error: 'Failed to queue tweet' });
    }

    return res.status(200).json({
      success: true,
      message: 'Tweet queued successfully',
      queueId: result.id
    });
  } catch (error) {
    logger.error('Error in tweetBettingEvent controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Export all controller functions
export default {
  checkTwitterConfig,
  getTweetQueueStatus,
  tweetNewGame,
  tweetGameResult,
  tweetBettingEvent
};