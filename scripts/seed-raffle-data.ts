import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { RaffleDraw, Prize } from '../src/models/raffle_model';
import User from '../src/models/user_model';

// Load environment variables
dotenv.config();

async function seedRaffleData() {
  try {
    console.log('Starting raffle data seeding...');

    // Use the same connection logic as the main server
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betmate';
    console.log(`Connecting to: ${mongoUri}`);

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Clear existing raffle data (optional)
    await RaffleDraw.deleteMany({});
    await Prize.deleteMany({});
    console.log('🧹 Cleared existing raffle data');

    // Create current active raffle
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const cutoff = new Date(weekFromNow.getTime() - 2 * 60 * 60 * 1000); // 2 hours before end

    const activeRaffle = new RaffleDraw({
      period: 'WEEKLY',
      startDate: now,
      endDate: weekFromNow,
      cutoffDate: cutoff,
      status: 'ACTIVE',
      totalTickets: 0
    });

    const savedActiveRaffle = await activeRaffle.save();
    console.log('🎯 Created active raffle:', savedActiveRaffle._id);

    // Get a dummy user for prizes (or create a placeholder)
    const dummyUser = await User.findOne() || { _id: new mongoose.Types.ObjectId() };

    // Create prizes for active raffle
    const activePrizes = [
      {
        drawId: savedActiveRaffle._id,
        userId: dummyUser._id,
        type: 'BETMATE_CREDITS',
        value: '1000'
      },
      {
        drawId: savedActiveRaffle._id,
        userId: dummyUser._id,
        type: 'BETMATE_CREDITS',
        value: '500'
      },
      {
        drawId: savedActiveRaffle._id,
        userId: dummyUser._id,
        type: 'BETMATE_CREDITS',
        value: '250'
      }
    ];

    const savedActivePrizes = await Prize.insertMany(activePrizes);
    console.log('🏆 Created active raffle prizes:', savedActivePrizes.length);

    // Create upcoming raffle
    const nextWeek = new Date(weekFromNow.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingCutoff = new Date(nextWeek.getTime() - 2 * 60 * 60 * 1000);

    const upcomingRaffle = new RaffleDraw({
      period: 'WEEKLY',
      startDate: weekFromNow,
      endDate: nextWeek,
      cutoffDate: upcomingCutoff,
      status: 'UPCOMING',
      totalTickets: 0
    });

    const savedUpcomingRaffle = await upcomingRaffle.save();
    console.log('📅 Created upcoming raffle:', savedUpcomingRaffle._id);

    // Create completed raffles for history (last 5 weeks)
    for (let i = 1; i <= 5; i++) {
      const startDate = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const cutoffDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000);
      const drawnAt = new Date(endDate.getTime() + Math.random() * 60 * 60 * 1000); // Random time within an hour after end

      const completedRaffle = new RaffleDraw({
        period: 'WEEKLY',
        startDate,
        endDate,
        cutoffDate,
        status: 'COMPLETED',
        totalTickets: Math.floor(Math.random() * 2000) + 500, // Random between 500-2500
        drawnAt,
        winningTicket: Math.floor(Math.random() * 1000)
      });

      const savedCompletedRaffle = await completedRaffle.save();

      // Create random prizes for completed raffle
      const numPrizes = Math.floor(Math.random() * 3) + 1; // 1-3 prizes
      const completedPrizes = [];
      
      for (let j = 0; j < numPrizes; j++) {
        const prizeTypes = ['BETMATE_CREDITS', 'BETMATE_CREDITS', 'GIFT_CARD']; // Bias toward BETMATE_CREDITS
        const prizeValues = [100, 250, 500, 1000];
        
        completedPrizes.push({
          drawId: savedCompletedRaffle._id,
          userId: dummyUser._id,
          type: prizeTypes[Math.floor(Math.random() * prizeTypes.length)],
          value: prizeValues[Math.floor(Math.random() * prizeValues.length)].toString(),
          claimed: Math.random() > 0.3 // 70% chance claimed
        });
      }

      await Prize.insertMany(completedPrizes);
      console.log(`📜 Created completed raffle ${i}/5 with ${numPrizes} prizes`);
    }

    console.log('\n🎉 Raffle data seeding completed successfully!');
    console.log('Created:');
    console.log('- 1 active weekly raffle with 3 prizes');
    console.log('- 1 upcoming weekly raffle');
    console.log('- 5 completed weekly raffles with random prizes');
    
  } catch (error) {
    console.error('❌ Error seeding raffle data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding
seedRaffleData();