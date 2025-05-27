import { Request, Response } from 'express';
import { RequestWithJWT } from '../types/requests';
import { RaffleDraw, RaffleTicket, Prize } from '../models/raffle_model';
import User from '../models/user_model';
import mongoose from 'mongoose';

export const getCurrentRaffle = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    
    // Get current active draws
    const activeDraws = await RaffleDraw.find({
      status: { $in: ['ACTIVE', 'UPCOMING'] },
      endDate: { $gte: now }
    }).sort({ endDate: 1 });

    // Get user's participation status if authenticated
    let userParticipation: Record<string, { tickets: number }> = {};
    const userId = (req as any).user?._id;
    console.log('getCurrentRaffle - userId:', userId);

    if (userId) {
      const userTickets = await RaffleTicket.find({
        userId: userId,
        drawId: { $in: activeDraws.map(draw => draw._id) }
      }).select('drawId coinBalance');

      console.log('getCurrentRaffle - userTickets found:', userTickets.length);
      userTickets.forEach(ticket => {
        console.log('Ticket:', { drawId: ticket.drawId, coinBalance: ticket.coinBalance });
      });

      userParticipation = userTickets.reduce((acc, ticket) => {
        acc[ticket.drawId.toString()] = { tickets: ticket.coinBalance };
        return acc;
      }, {} as Record<string, { tickets: number }>);

      console.log('getCurrentRaffle - userParticipation:', userParticipation);
    }

    // Count participants for each draw
    const participantCounts = await Promise.all(
      activeDraws.map(async (draw) => {
        const count = await RaffleTicket.countDocuments({ drawId: draw._id });
        return { drawId: draw._id.toString(), count };
      })
    );

    const participantMap = participantCounts.reduce((acc, item) => {
      acc[item.drawId] = item.count;
      return acc;
    }, {} as Record<string, number>);

    // Get prizes for each draw
    const raffleInfo = await Promise.all(
      activeDraws.map(async (draw) => {
        const prizes = await Prize.find({ drawId: draw._id }).select('type value');

        // Calculate actual total tickets from all participants
        const tickets = await RaffleTicket.find({ drawId: draw._id }).select('coinBalance');
        const actualTotalTickets = tickets.reduce((sum, ticket) => sum + ticket.coinBalance, 0);

        return {
          id: draw._id.toString(),
          period: draw.period,
          startDate: draw.startDate,
          endDate: draw.endDate,
          cutoffDate: draw.cutoffDate,
          status: draw.status,
          totalParticipants: participantMap[draw._id.toString()] || 0,
          totalTickets: actualTotalTickets,
          userTickets: userParticipation[draw._id.toString()]?.tickets || 0,
          prizes: prizes.map(prize => ({
            type: prize.type,
            value: prize.value
          }))
        };
      })
    );

    res.json({
      currentRaffles: raffleInfo
    });
  } catch (error) {
    console.error('Error fetching current raffle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const optInToRaffle = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { drawId } = req.body;
    
    if (!drawId) {
      res.status(400).json({ error: 'drawId is required' });
      return;
    }

    // Check if draw exists and is active
    const draw = await RaffleDraw.findById(drawId);

    if (!draw) {
      res.status(404).json({ error: 'Raffle draw not found' });
      return;
    }

    if (!['ACTIVE', 'UPCOMING'].includes(draw.status)) {
      res.status(400).json({ error: 'This raffle draw is not accepting participants' });
      return;
    }

    const now = new Date();
    if (now > draw.cutoffDate) {
      res.status(400).json({ error: 'Registration cutoff has passed for this draw' });
      return;
    }

    // Check if user already has tickets for this draw
    const existingTicket = await RaffleTicket.findOne({
      drawId,
      userId
    });

    if (existingTicket) {
      res.status(400).json({ 
        error: 'Already registered for this raffle',
        tickets: existingTicket.coinBalance
      });
      return;
    }

    // Get user's current coin balance (account field)
    const user = await User.findById(userId).select('account');
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const balance = user.account || 0;

    if (balance <= 0) {
      res.status(400).json({ error: 'Insufficient coin balance to participate' });
      return;
    }

    // For opt-in, we create a ticket with the user's current coin balance
    const ticket = await RaffleTicket.create({
      drawId,
      userId,
      coinBalance: balance,
      ticketStart: 0, // Will be set during actual draw
      ticketEnd: balance - 1
    });

    // Update the draw's total tickets count
    await RaffleDraw.findByIdAndUpdate(drawId, {
      $inc: { totalTickets: balance }
    });

    res.json({
      success: true,
      message: 'Successfully opted into raffle',
      tickets: balance,
      ticketId: ticket._id.toString()
    });
  } catch (error) {
    console.error('Error opting into raffle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTestRaffleData = async (req: Request, res: Response): Promise<void> => {
  try {
    // Clear existing raffle data
    await RaffleDraw.deleteMany({});
    await Prize.deleteMany({});

    // Create current active raffle
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const cutoff = new Date(weekFromNow.getTime() - 2 * 60 * 60 * 1000);

    const activeRaffle = new RaffleDraw({
      period: 'WEEKLY',
      startDate: now,
      endDate: weekFromNow,
      cutoffDate: cutoff,
      status: 'ACTIVE',
      totalTickets: 0
    });

    const savedActiveRaffle = await activeRaffle.save();

    // Get a dummy user for prizes (or create a placeholder)
    const dummyUser = await User.findOne() || { _id: new mongoose.Types.ObjectId() };

    // Create prizes for active raffle
    const activePrizes = [
      { drawId: savedActiveRaffle._id, userId: dummyUser._id, type: 'BETMATE_CREDITS', value: '1000' },
      { drawId: savedActiveRaffle._id, userId: dummyUser._id, type: 'BETMATE_CREDITS', value: '500' },
      { drawId: savedActiveRaffle._id, userId: dummyUser._id, type: 'BETMATE_CREDITS', value: '250' }
    ];

    await Prize.insertMany(activePrizes);

    // Create completed raffles for history
    for (let i = 1; i <= 3; i++) {
      const startDate = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const cutoffDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000);
      const drawnAt = new Date(endDate.getTime() + 30 * 60 * 1000);

      const completedRaffle = new RaffleDraw({
        period: 'WEEKLY',
        startDate,
        endDate,
        cutoffDate,
        status: 'COMPLETED',
        totalTickets: Math.floor(Math.random() * 1000) + 500,
        drawnAt,
        winningTicket: Math.floor(Math.random() * 500)
      });

      const savedCompletedRaffle = await completedRaffle.save();

      // Create prizes for completed raffle
      const completedPrizes = [
        { drawId: savedCompletedRaffle._id, userId: dummyUser._id, type: 'BETMATE_CREDITS', value: '1000', claimed: true },
        { drawId: savedCompletedRaffle._id, userId: dummyUser._id, type: 'BETMATE_CREDITS', value: '500', claimed: i % 2 === 0 }
      ];

      await Prize.insertMany(completedPrizes);
    }

    res.json({
      success: true,
      message: 'Test raffle data created successfully',
      data: {
        activeRaffles: 1,
        completedRaffles: 3,
        totalPrizes: 9
      }
    });
  } catch (error) {
    console.error('Error creating test raffle data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRaffleHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get completed draws with prizes
    const draws = await RaffleDraw.find({ 
      status: 'COMPLETED' 
    })
    .sort({ drawnAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'prizes',
      populate: {
        path: 'userId',
        select: 'first_name last_name full_name'
      }
    });

    // Get user participation for these draws if authenticated
    let userTickets: Record<string, number> = {};
    if (userId) {
      const tickets = await RaffleTicket.find({
        userId,
        drawId: { $in: draws.map(draw => draw._id) }
      }).select('drawId coinBalance');

      userTickets = tickets.reduce((acc, ticket) => {
        acc[ticket.drawId.toString()] = ticket.coinBalance;
        return acc;
      }, {} as Record<string, number>);
    }

    // Get prizes for each draw
    const drawsWithPrizes = await Promise.all(
      draws.map(async (draw) => {
        const prizes = await Prize.find({ drawId: draw._id })
          .populate('userId', 'first_name last_name full_name');

        return {
          id: draw._id.toString(),
          period: draw.period,
          startDate: draw.startDate,
          endDate: draw.endDate,
          drawnAt: draw.drawnAt,
          totalTickets: draw.totalTickets,
          winners: prizes.map(prize => ({
            username: (prize.userId as any)?.full_name || 'Anonymous',
            prizeType: prize.type,
            prizeValue: prize.value
          })),
          userParticipated: userId ? Boolean(userTickets[draw._id.toString()]) : false,
          userTickets: userId ? (userTickets[draw._id.toString()] || 0) : 0
        };
      })
    );

    res.json({
      raffleHistory: drawsWithPrizes,
      pagination: {
        page,
        limit,
        hasMore: draws.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching raffle history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};