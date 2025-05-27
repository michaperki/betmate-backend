const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Define schemas (simplified versions)
const raffleDrawSchema = new mongoose.Schema({
  period: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  cutoffDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['UPCOMING', 'ACTIVE', 'COMPLETED'], 
    default: 'ACTIVE' 
  },
  totalTickets: { type: Number, default: 0 },
  drawnAt: { type: Date },
  winningTicket: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

const prizeSchema = new mongoose.Schema({
  drawId: { type: mongoose.Schema.Types.ObjectId, ref: 'RaffleDraw', required: true },
  type: { type: String, enum: ['COINS', 'BADGE', 'PREMIUM'], required: true },
  value: { type: Number, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  claimed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const RaffleDraw = mongoose.model('RaffleDraw', raffleDrawSchema);
const Prize = mongoose.model('Prize', prizeSchema);

async function addTestRaffle() {
  try {
    // Connect to MongoDB - check multiple possible URIs
    let mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.log('No MONGODB_URI found in environment variables');
      console.log('Available environment variables:', Object.keys(process.env).filter(key => key.includes('MONGO')));

      // Try common local MongoDB URIs
      const localUris = [
        'mongodb://127.0.0.1:27017/betmate',
        'mongodb://localhost:27017/betmate',
        'mongodb://127.0.0.1:27017/test',
        'mongodb://localhost:27017/test'
      ];

      console.log('Trying local MongoDB connections...');
      for (const uri of localUris) {
        try {
          console.log(`Attempting: ${uri}`);
          await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 2000 // Short timeout for quick checks
          });
          mongoUri = uri;
          console.log(`✅ Connected to MongoDB at: ${uri}`);
          break;
        } catch (err) {
          console.log(`❌ Failed to connect to: ${uri}`);
          await mongoose.disconnect();
        }
      }

      if (!mongoUri) {
        throw new Error('Could not connect to any MongoDB instance');
      }
    } else {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log(`Connected to MongoDB at: ${mongoUri}`);
    }

    // Create current active raffle
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const cutoff = new Date(tomorrow.getTime() - 2 * 60 * 60 * 1000); // 2 hours before end

    const activeRaffle = new RaffleDraw({
      period: 'Daily',
      startDate: now,
      endDate: tomorrow,
      cutoffDate: cutoff,
      status: 'ACTIVE',
      totalTickets: 0
    });

    const savedRaffle = await activeRaffle.save();
    console.log('Created active raffle:', savedRaffle._id);

    // Create some prizes for this raffle
    const prizes = [
      {
        drawId: savedRaffle._id,
        type: 'COINS',
        value: 1000
      },
      {
        drawId: savedRaffle._id,
        type: 'COINS', 
        value: 500
      },
      {
        drawId: savedRaffle._id,
        type: 'BADGE',
        value: 1
      }
    ];

    const savedPrizes = await Prize.insertMany(prizes);
    console.log('Created prizes:', savedPrizes.length);

    // Create a completed raffle for history
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const completedRaffle = new RaffleDraw({
      period: 'Daily',
      startDate: twoDaysAgo,
      endDate: yesterday,
      cutoffDate: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000),
      status: 'COMPLETED',
      totalTickets: 1500,
      drawnAt: yesterday,
      winningTicket: 742
    });

    const savedCompletedRaffle = await completedRaffle.save();
    console.log('Created completed raffle:', savedCompletedRaffle._id);

    // Create prizes for completed raffle
    const completedPrizes = [
      {
        drawId: savedCompletedRaffle._id,
        type: 'COINS',
        value: 1000,
        claimed: true
      },
      {
        drawId: savedCompletedRaffle._id,
        type: 'COINS',
        value: 500,
        claimed: true
      }
    ];

    const savedCompletedPrizes = await Prize.insertMany(completedPrizes);
    console.log('Created completed raffle prizes:', savedCompletedPrizes.length);

    console.log('\n✅ Test raffle data created successfully!');
    console.log('- 1 active raffle with 3 prizes');
    console.log('- 1 completed raffle with 2 prizes');
    
  } catch (error) {
    console.error('Error creating test raffle:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
addTestRaffle();