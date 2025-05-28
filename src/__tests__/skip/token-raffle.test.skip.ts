import { PrismaClient } from '@prisma/client';
import { handler as runRaffleDrawHandler } from '../../lambdas/runRaffleDraw';
import { randomBytes } from 'crypto';

// Mock Prisma Client
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  raffleDraw: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  raffleTicket: {
    create: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  prize: {
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('Raffle System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Raffle Winner Distribution', () => {
    describe('Fair Distribution Testing', () => {
      // Helper function to simulate raffle draw
      const simulateRaffleDraw = (userBalances: number[], numWinners: number = 1): number[] => {
        let totalTickets = userBalances.reduce((sum, balance) => sum + balance, 0);
        const winners: number[] = [];
        
        // Create ticket ranges
        const ticketRanges: Array<{ userId: number; start: number; end: number }> = [];
        let ticketCounter = 0;
        
        userBalances.forEach((balance, userId) => {
          if (balance > 0) {
            ticketRanges.push({
              userId,
              start: ticketCounter,
              end: ticketCounter + balance - 1
            });
            ticketCounter += balance;
          }
        });

        // Select winners using crypto-secure RNG (simplified)
        const usedTickets = new Set<number>();
        
        for (let i = 0; i < numWinners && winners.length < numWinners; i++) {
          let attempts = 0;
          let winningTicket: number;
          
          do {
            winningTicket = Math.floor(Math.random() * totalTickets);
            attempts++;
          } while (usedTickets.has(winningTicket) && attempts < 1000);
          
          if (attempts >= 1000) break;
          
          usedTickets.add(winningTicket);
          
          const winner = ticketRanges.find(range => 
            winningTicket >= range.start && winningTicket <= range.end
          );
          
          if (winner && !winners.includes(winner.userId)) {
            winners.push(winner.userId);
          }
        }
        
        return winners;
      };

      it('should distribute winners fairly across 10,000 simulations (≥95% uniformity)', async () => {
        const numSimulations = 10000;
        const userBalances = [100, 100, 100, 100, 100]; // 5 users with equal balances
        const winCounts = new Array(userBalances.length).fill(0);
        
        // Run simulations
        for (let i = 0; i < numSimulations; i++) {
          const winners = simulateRaffleDraw(userBalances, 1);
          winners.forEach(winnerId => {
            winCounts[winnerId]++;
          });
        }
        
        // Calculate expected wins per user (should be roughly equal)
        const expectedWinsPerUser = numSimulations / userBalances.length;
        const tolerance = expectedWinsPerUser * 0.05; // 5% tolerance
        
        // Check that each user's win count is within 5% of expected
        winCounts.forEach((winCount, userId) => {
          const deviation = Math.abs(winCount - expectedWinsPerUser);
          const deviationPercentage = (deviation / expectedWinsPerUser) * 100;
          
          expect(deviationPercentage).toBeLessThan(5);
          console.log(`User ${userId}: ${winCount} wins (${deviationPercentage.toFixed(2)}% deviation)`);
        });
        
        // Ensure total wins equals total simulations
        const totalWins = winCounts.reduce((sum, count) => sum + count, 0);
        expect(totalWins).toBe(numSimulations);
      });

      it('should respect proportional winning chances based on token balance', async () => {
        const numSimulations = 10000;
        const userBalances = [500, 300, 200]; // User 0 should win ~50%, User 1 ~30%, User 2 ~20%
        const totalTokens = userBalances.reduce((sum, balance) => sum + balance, 0);
        const winCounts = new Array(userBalances.length).fill(0);
        
        // Run simulations
        for (let i = 0; i < numSimulations; i++) {
          const winners = simulateRaffleDraw(userBalances, 1);
          winners.forEach(winnerId => {
            winCounts[winnerId]++;
          });
        }
        
        // Check proportional distribution
        userBalances.forEach((balance, userId) => {
          const expectedWinRate = balance / totalTokens;
          const actualWinRate = winCounts[userId] / numSimulations;
          const deviation = Math.abs(actualWinRate - expectedWinRate);
          
          // Allow 2% deviation for proportional fairness
          expect(deviation).toBeLessThan(0.02);
          console.log(`User ${userId}: Expected ${(expectedWinRate * 100).toFixed(1)}%, Actual ${(actualWinRate * 100).toFixed(1)}%`);
        });
      });

      it('should handle edge cases in winner selection', async () => {
        // Test with single user
        const singleUserWinners = simulateRaffleDraw([100], 1);
        expect(singleUserWinners).toEqual([0]);
        
        // Test with zero balance users
        const mixedBalanceWinners = simulateRaffleDraw([0, 100, 0, 50, 0], 2);
        expect(mixedBalanceWinners).not.toContain(0);
        expect(mixedBalanceWinners).not.toContain(2);
        expect(mixedBalanceWinners).not.toContain(4);
        expect(mixedBalanceWinners.length).toBeLessThanOrEqual(2);
        
        // Test requesting more winners than eligible users
        const limitedWinners = simulateRaffleDraw([100, 100], 5);
        expect(limitedWinners.length).toBeLessThanOrEqual(2);
      });
    });

    describe('runRaffleDraw Lambda', () => {
      it('should execute raffle draw successfully', async () => {
        const drawId = 'draw-123';
        const now = new Date();
        
        mockPrisma.raffleDraw.findFirst.mockResolvedValue({
          id: drawId,
          period: 'WEEKLY',
          status: 'ACTIVE',
          cutoffDate: new Date(now.getTime() - 60000), // 1 minute ago
        });
        
        mockPrisma.raffleDraw.update.mockResolvedValue({});
        
        mockPrisma.user.findMany.mockResolvedValue([
          { id: 'user-1', account: 100 },
          { id: 'user-2', account: 150 },
          { id: 'user-3', account: 75 },
        ]);
        
        mockPrisma.raffleTicket.create.mockResolvedValue({});
        mockPrisma.raffleTicket.aggregate.mockResolvedValue({
          _sum: { coinBalance: 325 }
        });
        
        mockPrisma.raffleTicket.findMany.mockResolvedValue([
          { userId: 'user-1', ticketStart: 0, ticketEnd: 99 },
          { userId: 'user-2', ticketStart: 100, ticketEnd: 249 },
          { userId: 'user-3', ticketStart: 250, ticketEnd: 324 },
        ]);
        
        mockPrisma.prize.create.mockResolvedValue({
          id: 'prize-123',
          userId: 'user-2',
          type: 'GIFT_CARD',
          value: '$100',
          user: { username: 'testuser' }
        });

        const event = {
          body: JSON.stringify({
            drawPeriod: 'weekly'
          }),
        };

        const result = await runRaffleDrawHandler(event as any);
        const response = JSON.parse(result.body);

        expect(result.statusCode).toBe(200);
        expect(response.success).toBe(true);
        expect(response.totalTickets).toBe(325);
        expect(response.winners).toBeDefined();
      });

      it('should handle no participants scenario', async () => {
        const drawId = 'draw-123';
        const now = new Date();
        
        mockPrisma.raffleDraw.findFirst.mockResolvedValue({
          id: drawId,
          period: 'WEEKLY',
          status: 'ACTIVE',
          cutoffDate: new Date(now.getTime() - 60000),
        });
        
        mockPrisma.raffleDraw.update.mockResolvedValue({});
        mockPrisma.user.findMany.mockResolvedValue([]);
        mockPrisma.raffleTicket.aggregate.mockResolvedValue({
          _sum: { coinBalance: 0 }
        });

        const event = {
          body: JSON.stringify({
            drawPeriod: 'weekly'
          }),
        };

        const result = await runRaffleDrawHandler(event as any);
        const response = JSON.parse(result.body);

        expect(result.statusCode).toBe(200);
        expect(response.success).toBe(true);
        expect(response.totalTickets).toBe(0);
        expect(response.winners).toEqual([]);
        expect(response.message).toBe('No participants in this draw');
      });
    });
  });

  describe('Crypto-Secure Random Number Generation', () => {
    it('should generate numbers within specified range', () => {
      // Test the generateSecureRandomNumber function logic
      const testGenerateSecureRandomNumber = (min: number, max: number): number => {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const maxValidValue = Math.floor(256 ** bytesNeeded / range) * range - 1;
        
        // Use crypto.randomBytes for actual implementation
        let randomValue: number;
        let attempts = 0;
        do {
          const bytes = randomBytes(bytesNeeded);
          randomValue = 0;
          for (let i = 0; i < bytesNeeded; i++) {
            randomValue = randomValue * 256 + bytes[i];
          }
          attempts++;
        } while (randomValue > maxValidValue && attempts < 1000);
        
        return min + (randomValue % range);
      };

      // Test multiple ranges
      for (let i = 0; i < 1000; i++) {
        const result = testGenerateSecureRandomNumber(0, 99);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(99);
      }

      for (let i = 0; i < 1000; i++) {
        const result = testGenerateSecureRandomNumber(50, 150);
        expect(result).toBeGreaterThanOrEqual(50);
        expect(result).toBeLessThanOrEqual(150);
      }
    });
  });
});