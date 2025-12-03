// Define local interfaces instead of importing from aws-lambda
interface APIGatewayProxyEvent {
  body: string | null;
}

interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
}
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { RaffleDraw, RaffleTicket, Prize } from '../models/raffle_model';
import User from '../models/user_model';
import { configureMongoose, DEFAULT_MONGOOSE_OPTIONS } from '../helpers/mongoose_config';

configureMongoose();

interface RunRaffleDrawRequest {
  drawPeriod: 'weekly' | 'monthly';
}

interface RunRaffleDrawResponse {
  success: boolean;
  drawId?: string;
  totalTickets?: number;
  winners?: Array<{
    userId: string;
    username: string;
    prizeType: string;
    prizeValue: string;
  }>;
  message?: string;
}

interface WinnerEvent {
  eventType: 'WINNER_DECLARED';
  drawId: string;
  userId: string;
  username: string;
  prizeType: string;
  prizeValue: string;
  timestamp: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || '', DEFAULT_MONGOOSE_OPTIONS);
    }

    const { drawPeriod }: RunRaffleDrawRequest = JSON.parse(event.body || '{}');

    if (!drawPeriod || !['weekly', 'monthly'].includes(drawPeriod)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Invalid drawPeriod. Must be "weekly" or "monthly"'
        })
      };
    }

    // Find the active draw for this period
    const now = new Date();
    const draw = await RaffleDraw.findOne({
      period: drawPeriod.toUpperCase(),
      status: 'ACTIVE',
      cutoffDate: { $lte: now }
    }).sort({ cutoffDate: -1 });

    if (!draw) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: `No active ${drawPeriod} draw found ready for execution`
        })
      };
    }

    // Update draw status to DRAWING
    await RaffleDraw.findByIdAndUpdate(draw._id, { status: 'DRAWING' });

    try {
      // Snapshot coin balances at cutoff and create tickets
      await createRaffleTickets(draw._id.toString(), draw.cutoffDate);

      // Calculate total tickets
      const totalTicketsResult = await RaffleTicket.aggregate([
        { $match: { drawId: draw._id } },
        { $group: { _id: null, total: { $sum: '$coinBalance' } } }
      ]);
      
      const totalTickets = totalTicketsResult[0]?.total || 0;

      // Update total tickets in draw
      await RaffleDraw.findByIdAndUpdate(draw._id, { totalTickets });

      if (totalTickets === 0) {
        await RaffleDraw.findByIdAndUpdate(draw._id, { 
          status: 'COMPLETED',
          drawnAt: now
        });

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            drawId: draw._id.toString(),
            totalTickets: 0,
            winners: [],
            message: 'No participants in this draw'
          })
        };
      }

      // Select winners using crypto-secure RNG
      const winners = await selectWinners(draw._id.toString(), totalTickets);

      // Create prize records
      const createdPrizes = await createPrizes(draw._id.toString(), winners);

      // Update draw status to COMPLETED
      await RaffleDraw.findByIdAndUpdate(draw._id, { 
        status: 'COMPLETED',
        drawnAt: now
      });

      // Emit WINNER_DECLARED events
      await emitWinnerEvents(draw._id.toString(), createdPrizes);

      const response: RunRaffleDrawResponse = {
        success: true,
        drawId: draw._id.toString(),
        totalTickets,
        winners: createdPrizes.map(prize => ({
          userId: prize.userId.toString(),
          username: (prize.userId as any).full_name || 'Anonymous',
          prizeType: prize.type,
          prizeValue: prize.value
        }))
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response)
      };

    } catch (error) {
      // Rollback draw status on error
      await RaffleDraw.findByIdAndUpdate(draw._id, { status: 'ACTIVE' });
      throw error;
    }

  } catch (error) {
    console.error('Error running raffle draw:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error'
      })
    };
  }
};

async function createRaffleTickets(drawId: string, cutoffDate: Date): Promise<void> {
  // Get all users with positive coin balances (account field)
  const users = await User.find({
    account: { $gt: 0 }
  }).select('_id account');

  let ticketCounter = 0;

  for (const user of users) {
    const balance = user.account;
    const ticketStart = ticketCounter;
    const ticketEnd = ticketCounter + balance - 1;

    await RaffleTicket.create({
      drawId,
      userId: user._id,
      coinBalance: balance,
      ticketStart,
      ticketEnd
    });

    ticketCounter += balance;
  }
}

async function selectWinners(drawId: string, totalTickets: number): Promise<Array<{ userId: string; ticketNumber: number }>> {
  // For this example, we'll select 3 winners
  // In production, this would be configurable based on draw rules
  const numberOfWinners = Math.min(3, Math.floor(totalTickets / 100)); // 1 winner per 100 tickets, max 3

  if (numberOfWinners === 0) return [];

  const winners: Array<{ userId: string; ticketNumber: number }> = [];
  const usedTickets = new Set<number>();

  const tickets = await RaffleTicket.find({ drawId }).sort({ ticketStart: 1 });

  for (let i = 0; i < numberOfWinners; i++) {
    let winningTicket: number;
    let attempts = 0;
    
    // Ensure we don't pick the same ticket twice
    do {
      winningTicket = generateSecureRandomNumber(0, totalTickets - 1);
      attempts++;
    } while (usedTickets.has(winningTicket) && attempts < 1000);

    if (attempts >= 1000) break; // Safety break

    usedTickets.add(winningTicket);

    // Find which user owns this ticket
    const winningUser = tickets.find(ticket => 
      winningTicket >= ticket.ticketStart && winningTicket <= ticket.ticketEnd
    );

    if (winningUser && !winners.some(w => w.userId === winningUser.userId.toString())) {
      winners.push({
        userId: winningUser.userId.toString(),
        ticketNumber: winningTicket
      });
    }
  }

  return winners;
}

function generateSecureRandomNumber(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValidValue = Math.floor(256 ** bytesNeeded / range) * range - 1;
  
  let randomValue: number;
  do {
    const randomBytesArray = randomBytes(bytesNeeded);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = randomValue * 256 + randomBytesArray[i];
    }
  } while (randomValue > maxValidValue);
  
  return min + (randomValue % range);
}

async function createPrizes(drawId: string, winners: Array<{ userId: string; ticketNumber: number }>) {
  const prizes = [];
  
  for (let i = 0; i < winners.length; i++) {
    const prizeValue = i === 0 ? '$100' : i === 1 ? '$50' : '$25'; // First, second, third place
    
    const prize = await Prize.create({
      drawId,
      userId: winners[i].userId,
      type: 'GIFT_CARD',
      value: prizeValue,
      code: `PLACEHOLDER_${drawId}_${i}` // Placeholder for actual gift card code
    });
    
    const populatedPrize = await Prize.findById(prize._id).populate('userId', 'full_name');
    prizes.push(populatedPrize);
  }
  
  return prizes;
}

async function emitWinnerEvents(drawId: string, prizes: any[]): Promise<void> {
  // In a real implementation, this would publish to EventBridge or SQS
  // For now, we'll just log the events
  for (const prize of prizes) {
    const event: WinnerEvent = {
      eventType: 'WINNER_DECLARED',
      drawId,
      userId: prize.userId._id.toString(),
      username: prize.userId.full_name || 'Anonymous',
      prizeType: prize.type,
      prizeValue: prize.value,
      timestamp: new Date().toISOString()
    };
    
    console.log('WINNER_DECLARED event:', JSON.stringify(event));
    
    // TODO: Publish to EventBridge
    // await eventBridge.putEvents({
    //   Entries: [{
    //     Source: 'betmate.raffle',
    //     DetailType: 'Winner Declared',
    //     Detail: JSON.stringify(event)
    //   }]
    // }).promise();
  }
}
