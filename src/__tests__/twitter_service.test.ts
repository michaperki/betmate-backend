import twitterService from '../services/twitter_service';

// No need to mock twitter-api-v2 since we're not using it yet

// Mock environment variables
const originalEnv = process.env;

describe('Twitter Service', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    
    // Mock logger
    jest.mock('../helpers/axiom_logger', () => ({
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isConfigured', () => {
    test('should return false when no credentials are configured', () => {
      expect(twitterService.isConfigured()).toBe(false);
    });

    test('should return true when OAuth 1.0a credentials are configured', () => {
      process.env.TWITTER_API_KEY = 'test-key';
      process.env.TWITTER_API_SECRET = 'test-secret';
      process.env.TWITTER_ACCESS_TOKEN = 'test-token';
      process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';
      
      expect(twitterService.isConfigured()).toBe(true);
    });

    test('should return true when OAuth 2.0 credentials are configured', () => {
      process.env.TWITTER_CLIENT_ID = 'test-client-id';
      process.env.TWITTER_CLIENT_SECRET = 'test-client-secret';
      
      expect(twitterService.isConfigured()).toBe(true);
    });
  });

  describe('tweetNewGame', () => {
    test('should return null when Twitter is not configured', async () => {
      const result = await twitterService.tweetNewGame(
        'game123',
        'Player1',
        'Player2',
        '10+0'
      );
      
      expect(result).toBeNull();
    });

    test('should post a tweet about a new game when configured', async () => {
      process.env.TWITTER_API_KEY = 'test-key';
      process.env.TWITTER_API_SECRET = 'test-secret';
      process.env.TWITTER_ACCESS_TOKEN = 'test-token';
      process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';
      
      const result = await twitterService.tweetNewGame(
        'game123',
        'Player1',
        'Player2',
        '10+0'
      );
      
      expect(result).toEqual({
        id: 'mock-tweet-id-123',
        text: expect.stringContaining('Player1') && expect.stringContaining('Player2')
      });
    });
  });

  describe('tweetGameResult', () => {
    beforeEach(() => {
      process.env.TWITTER_API_KEY = 'test-key';
      process.env.TWITTER_API_SECRET = 'test-secret';
      process.env.TWITTER_ACCESS_TOKEN = 'test-token';
      process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';
    });
    
    test('should handle white win result', async () => {
      const result = await twitterService.tweetGameResult(
        'game123',
        'Player1',
        'Player2',
        '1-0'
      );
      
      expect(result).toEqual({
        id: 'mock-tweet-id-123',
        text: expect.stringContaining('Player1') && expect.stringContaining('won')
      });
    });
    
    test('should handle black win result', async () => {
      const result = await twitterService.tweetGameResult(
        'game123',
        'Player1',
        'Player2',
        '0-1'
      );
      
      expect(result).toEqual({
        id: 'mock-tweet-id-123',
        text: expect.stringContaining('Player2') && expect.stringContaining('won')
      });
    });
    
    test('should handle draw result', async () => {
      const result = await twitterService.tweetGameResult(
        'game123',
        'Player1',
        'Player2',
        '1/2-1/2'
      );
      
      expect(result).toEqual({
        id: 'mock-tweet-id-123',
        text: expect.stringContaining('draw')
      });
    });
  });

  describe('tweetBettingEvent', () => {
    test('should post a tweet about a betting event', async () => {
      process.env.TWITTER_API_KEY = 'test-key';
      process.env.TWITTER_API_SECRET = 'test-secret';
      process.env.TWITTER_ACCESS_TOKEN = 'test-token';
      process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';
      
      const result = await twitterService.tweetBettingEvent(
        'game123',
        'Big bet of 500 coins placed on White to win'
      );
      
      expect(result).toEqual({
        id: 'mock-tweet-id-123',
        text: expect.stringContaining('Big bet of 500 coins placed on White to win')
      });
    });
  });
});