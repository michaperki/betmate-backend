import { BotPersona } from '../agents/seedBot';
import { Server } from 'socket.io';
import { ChessEmitEvents } from '../types/websocket';
import { userService } from '.';
import seedBot from '../agents/seedBot';

// Track empty move bars and when they became empty
const emptyMoveBars: Record<string, number> = {};

/**
 * Initialize seed bots with different personas
 */
export const initializeBots = async (): Promise<void> => {
  try {
    // Check if bots already exist
    if (process.env.NODE_ENV !== 'test') {
      console.log('Checking for existing bots...');
    }
    const existingBots = await userService.getBotUsers();

    if (process.env.NODE_ENV !== 'test') {
      console.log(`Found ${existingBots.length} existing bots`);
    }

    if (existingBots.length >= 4) {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Seed bots already exist');
      }
      return;
    }

    // Create the four bot personas if they don't exist
    const botConfigs = [
      {
        email: 'bookworm@betmate.bot',
        password: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        first_name: 'Book',
        last_name: 'Worm',
        is_bot: true,
        account: 500,
        botConfig: {
          persona: BotPersona.BOOKWORM,
          riskFactor: 0.05, // 5% of bankroll at most
          maxBankroll: 500,
          minWagerAmount: 1,
          maxWagerAmount: 25,
          emptyBarThreshold: 0 // Not used by this persona
        }
      },
      {
        email: 'riskyrook@betmate.bot',
        password: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        first_name: 'Risky',
        last_name: 'Rook',
        is_bot: true,
        account: 500,
        botConfig: {
          persona: BotPersona.RISKY_ROOK,
          riskFactor: 0.1, // 10% of bankroll at most
          maxBankroll: 500,
          minWagerAmount: 2,
          maxWagerAmount: 50,
          emptyBarThreshold: 0 // Not used by this persona
        }
      },
      {
        email: 'chaosknight@betmate.bot',
        password: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        first_name: 'Chaos',
        last_name: 'Knight',
        is_bot: true,
        account: 500,
        botConfig: {
          persona: BotPersona.CHAOS_KNIGHT,
          riskFactor: 0.15, // 15% of bankroll at most
          maxBankroll: 500,
          minWagerAmount: 5,
          maxWagerAmount: 75,
          emptyBarThreshold: 0 // Not used by this persona
        }
      },
      {
        email: 'latejoiner@betmate.bot',
        password: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        first_name: 'Late',
        last_name: 'Joiner',
        is_bot: true,
        account: 500,
        botConfig: {
          persona: BotPersona.LATE_JOINER,
          riskFactor: 0.08, // 8% of bankroll at most
          maxBankroll: 500,
          minWagerAmount: 1,
          maxWagerAmount: 40,
          emptyBarThreshold: 10 // Wait 10 seconds before placing wager
        }
      }
    ];

    // Create bot accounts
    for (const botConfig of botConfigs) {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Checking for bot: ${botConfig.email}`);
      }

      const existingBot = await userService.getUserByEmail(botConfig.email);

      if (!existingBot) {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`Creating new bot: ${botConfig.first_name} ${botConfig.last_name}`);
        }
        const newBot = await userService.createUser(botConfig);
        if (process.env.NODE_ENV !== 'test') {
          console.log(`Created bot: ${botConfig.first_name} ${botConfig.last_name}`);
        }

        // Register bot with the seedBot service
        seedBot.registerBot(newBot._id.toString(), botConfig.botConfig);
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`Bot already exists: ${botConfig.first_name} ${botConfig.last_name}`);
        }
        // Register existing bot with the seedBot service
        seedBot.registerBot(existingBot._id.toString(), botConfig.botConfig);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Failed to initialize bots: ${error.message}`);
    }
  }
};

/**
 * Handle new move events to track empty move bars
 */
export const handleNewMoveEvent = (gameId: string, hasWagers: boolean): void => {
  // If the move bar is empty, record the time
  if (!hasWagers) {
    emptyMoveBars[gameId] = Date.now();
  } else {
    // If move bar has wagers, remove it from tracking
    delete emptyMoveBars[gameId];
  }
};

/**
 * Process bot wagers for a specific game immediately
 */
export const processBotWagersForGame = async (gameId: string, io: any): Promise<void> => {
  try {
    // Get bot users
    const bots = await userService.getBotUsers();

    if (bots.length === 0) {
      return;
    }

    // Get the game details
    const game = await userService.getChessGame(gameId);

    if (!game || game.game_status !== 'in_progress') {
      return;
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Bot Wagers] Processing ${bots.length} bots for game ${gameId} move ${game.move_hist.length + 1}`);
    }

    // Have each bot consider placing a wager (with some randomness to avoid all bots betting)
    for (const bot of bots) {
      // Add some randomness - not every bot bets on every move
      const shouldConsiderWager = Math.random() < 0.7; // 70% chance per bot per move

      if (shouldConsiderWager) {
        try {
          await seedBot.processBotWager(io, bot as any, game);
        } catch (error) {
          if (process.env.NODE_ENV !== 'test') {
            console.log(`Bot ${bot.first_name} wager failed: ${error.message}`);
          }
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Failed to process bot wagers for game ${gameId}: ${error.message}`);
    }
  }
};

/**
 * Process games with empty move bars (legacy approach)
 */
export const processEmptyMoveBars = async (io: any): Promise<void> => {
  try {
    // Get active games with empty move bars
    const gameIds = Object.keys(emptyMoveBars);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Bot Service] Checking ${gameIds.length} games with empty move bars`);
    }

    if (gameIds.length === 0) {
      return;
    }

    // Get bot users
    const bots = await userService.getBotUsers();

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Bot Service] Found ${bots.length} bots available`);
    }

    if (bots.length === 0) {
      if (process.env.NODE_ENV !== 'test') {
        console.log('No bot users found');
      }
      return;
    }

    // For each game with an empty move bar
    for (const gameId of gameIds) {
      // Get the game details
      const game = await userService.getChessGame(gameId);
      
      if (!game) {
        delete emptyMoveBars[gameId];
        continue;
      }

      // Skip if game is not active (using game_status to determine)
      if (game.game_status !== 'in_progress') {
        delete emptyMoveBars[gameId];
        continue;
      }

      // Count real users with wagers in this game
      const realUserCount = await userService.countRealUsersWithWagers(gameId);
      
      // Skip if too many real users (configurable threshold)
      if (realUserCount >= 5) { // Threshold for when to stop bot activity
        delete emptyMoveBars[gameId];
        continue;
      }

      // Choose a random bot to place a wager
      const botIndex = Math.floor(Math.random() * bots.length);
      const bot = bots[botIndex];
      
      // Process wager for this bot
      await seedBot.processBotWager(io, bot as any, game, emptyMoveBars[gameId]);

      // Check if wagers now exist - if so, remove from tracking
      const moveNumber = game.move_hist.length;
      const hasWagers = await userService.moveHasWagers(gameId, moveNumber);
      
      if (hasWagers) {
        delete emptyMoveBars[gameId];
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Failed to process empty move bars: ${error.message}`);
    }
  }
};

/**
 * Schedule daily bankroll refresh for bots
 */
export const scheduleRefreshBankrolls = (): NodeJS.Timeout => {
  // Refresh bot bankrolls once per day (at midnight)
  return setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      seedBot.refreshBotBankrolls()
        .catch(err => {
          if (process.env.NODE_ENV !== 'test') {
            console.log(`Failed to refresh bot bankrolls: ${err.message}`);
          }
        });
    }
  }, 60 * 1000); // Check every minute
};

export default {
  initializeBots,
  handleNewMoveEvent,
  processEmptyMoveBars,
  processBotWagersForGame,
  scheduleRefreshBankrolls,
};