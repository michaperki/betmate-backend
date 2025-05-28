/* eslint-disable no-mixed-operators */
import { Server } from 'socket.io';
import { ChessDoc } from '../types/models/chess';
import { UserDoc } from '../types/models/user';
import { wagerService, userService, microserviceService } from '../services';
import { CreateWagerQuery, WagerStatus } from '../types/models/wager';
import mongoose from 'mongoose';
import { ChessEmitEvents } from '../types/websocket';
import { AxiosError } from 'axios';

// Bot personas
export enum BotPersona {
  BOOKWORM = 'bookworm',     // Always best engine line
  RISKY_ROOK = 'risky_rook', // 70% best, 30% 2-3rd best
  CHAOS_KNIGHT = 'chaos_knight', // Uniform over legal moves
  LATE_JOINER = 'late_joiner', // Stakes only if bar empty ≥ 10s
}

// Bot configuration
interface BotConfig {
  persona: BotPersona;
  riskFactor: number; // 0-1 scale determining how much of allowance to bet
  maxBankroll: number; // Maximum tokens this bot can hold
  minWagerAmount: number; // Minimum wager amount
  maxWagerAmount: number; // Maximum wager amount per bet
  emptyBarThreshold: number; // Seconds to wait (for LATE_JOINER)
}

// House bot user information
export interface BotUser extends Omit<UserDoc, 'botConfig'> {
  botConfig: BotConfig;
}

// Mapping of bot IDs to their configurations
const botConfigs: Record<string, BotConfig> = {};

/**
 * Calculate stake based on eval score, bankroll and persona
 */
function calculateStake(
  score: number, 
  bankroll: number, 
  riskFactor: number, 
  minAmount: number, 
  maxAmount: number
): number {
  // Base calculation as a percentage of bankroll
  const baseStake = bankroll * riskFactor * (Math.min(Math.abs(score), 300) / 300);
  
  // Ensure the stake is within limits
  return Math.max(
    minAmount,
    Math.min(maxAmount, Math.round(baseStake))
  );
}

/**
 * Select a move based on bot persona and top moves
 */
async function selectMove(
  persona: BotPersona,
  fen: string,
  topMoves: TopMoveData
): Promise<string> {
  if (!topMoves.length) {
    return '';
  }

  switch (persona) {
    case BotPersona.BOOKWORM:
      // Always choose the best move
      return topMoves[0].move;

    case BotPersona.RISKY_ROOK: {
      // 70% chance for best move, 30% for 2nd or 3rd
      const rand = Math.random();
      if (rand < 0.7 || topMoves.length === 1) {
        return topMoves[0].move;
      }
      // Choose between 2nd and 3rd best if available
      const index = Math.min(1 + Math.floor(Math.random() * 2), topMoves.length - 1);
      return topMoves[index].move;
    }

    case BotPersona.CHAOS_KNIGHT: {
      // Completely random from available moves
      const index = Math.floor(Math.random() * topMoves.length);
      return topMoves[index].move;
    }

    case BotPersona.LATE_JOINER:
      // LATE_JOINER uses the best move when it decides to bet
      return topMoves[0].move;

    default:
      return topMoves[0].move;
  }
}

/**
 * Check if a move has any wagers
 */
async function moveHasWagers(gameId: string, moveNumber: number): Promise<boolean> {
  const wagers = await wagerService.getWagers({
    game_id: mongoose.Types.ObjectId(gameId),
    move_number: moveNumber
  });
  return wagers.length > 0;
}

/**
 * Check if a bot should place a wager based on its persona
 */
async function shouldPlaceWager(
  bot: BotUser,
  game: ChessDoc,
  moveEmptyTime?: number
): Promise<boolean> {
  // If bot doesn't have enough funds, don't place wager
  if (bot.account < bot.botConfig.minWagerAmount) {
    return false;
  }

  // For LATE_JOINER, only place wager if the bar has been empty for threshold time
  if (bot.botConfig.persona === BotPersona.LATE_JOINER) {
    return Boolean(moveEmptyTime && 
      (Date.now() - moveEmptyTime) >= bot.botConfig.emptyBarThreshold * 1000);
  }

  // Other personas always try to place wagers
  return true;
}

/**
 * Process a game and place a wager if conditions are met
 */
export async function processBotWager(
  io: Server<any, ChessEmitEvents>,
  bot: BotUser,
  game: ChessDoc,
  moveEmptyTime?: number
): Promise<void> {
  try {
    // Check if the bot should place a wager
    const shouldWager = await shouldPlaceWager(bot, game, moveEmptyTime);
    if (!shouldWager) {
      return;
    }

    const moveNumber = game.move_hist.length + 1; // Bet on the NEXT move that will be played

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Bot ${bot.botConfig.persona}] Placing wager for game ${game._id} move ${moveNumber} (${game.move_hist.length} moves played)`);
    }

    // Get position evaluation and best moves
    const fen = game.state;
    const topMoves = await microserviceService.getTopMoves(fen, 3);
    const wdlData = await microserviceService.getWDL(fen, game.time_white, game.time_black);
    
    // Skip if no moves available
    if (!topMoves || !topMoves.length) {
      return;
    }

    // Select a move based on bot persona
    const selectedMove = await selectMove(bot.botConfig.persona, fen, topMoves);
    if (!selectedMove) {
      return;
    }

    // Get move analysis to calculate stake
    let moveScore = 0;
    try {
      const moveAnalysis = await microserviceService.getMoveAnalysis(fen, selectedMove);
      moveScore = moveAnalysis.score;
    } catch (error) {
      // If we can't get the score, use a default value
      moveScore = 0;
    }

    // Calculate stake based on eval and bot config
    const stake = calculateStake(
      moveScore,
      bot.account,
      bot.botConfig.riskFactor,
      bot.botConfig.minWagerAmount,
      bot.botConfig.maxWagerAmount
    );

    // Create and place wager
    const newWager: CreateWagerQuery = {
      game_id: mongoose.Types.ObjectId(game._id),
      better_id: mongoose.Types.ObjectId(bot._id),
      wdl: false, // This is a move bet, not a game outcome bet
      amount: stake,
      odds: 1, // Standard odds for pool wager
      data: selectedMove,
      move_number: moveNumber,
      status: WagerStatus.PENDING,
      is_bot: true,
      skip_game_check: true,
    };

    // Place the wager
    await wagerService.createWager(newWager);

    // Update bot account balance
    await userService.updateUser(bot._id, { $inc: { account: -stake } });

    // Emit pool_wager event to inform clients
    const wagerEvent = {
      gameId: game._id.toString(),
      type: 'move' as 'move',
      data: selectedMove,
      amount: stake,
    };

    io.to(game._id.toString()).emit('pool_wager', wagerEvent);
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Bot ${bot.botConfig.persona} placed wager on game ${game._id}`);
    }
  } catch (error) {
    const err = error as Error | AxiosError;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Bot wager error: ${err.message}`);
    }
  }
}

/**
 * Refresh bot bankrolls at scheduled times (e.g., nightly)
 */
export async function refreshBotBankrolls(): Promise<void> {
  try {
    // Get all bot users
    const botUsers = await userService.getBotUsers();
    
    // Update each bot's account to its configured maximum if needed
    for (const bot of botUsers) {
      const config = botConfigs[bot._id.toString()] || bot.botConfig;
      if (bot.account < config.maxBankroll) {
        await userService.updateUser(bot._id, { account: config.maxBankroll });
        if (process.env.NODE_ENV !== 'test') {
          console.log(`Refreshed bankroll for bot ${bot._id} to ${config.maxBankroll}`);
        }
      }
    }
  } catch (error) {
    const err = error as Error;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Failed to refresh bot bankrolls: ${err.message}`);
    }
  }
}

/**
 * Register a new bot with the system
 */
export function registerBot(botId: string, config: BotConfig): void {
  botConfigs[botId] = config;
}

export default {
  processBotWager,
  refreshBotBankrolls,
  registerBot,
};