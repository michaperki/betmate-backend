/**
 * Test script for Twitter queue functionality
 * 
 * This script tests the tweet queue implementation by queuing multiple tweets
 * and checking if they are properly limited to 5 per day and spaced out.
 * 
 * Usage: 
 * - Set ENABLE_TWITTER=true environment variable
 * - Run with Node.js: node test-twitter-queue.js
 */

require('dotenv').config();

// Force enable Twitter for testing with mock implementations
process.env.ENABLE_TWITTER = 'true';

const twitterService = require('./dist/services/twitter_service').default;

// Test function to queue multiple tweets and monitor the queue
async function testTweetQueue() {
  console.log('\n=== Twitter Queue Test ===\n');
  
  // Check if the Twitter service is configured
  console.log('Twitter service configured:', twitterService.isConfigured());
  
  // Queue a series of test tweets (more than the daily limit to test limiting)
  console.log('\nQueuing test tweets...');
  
  // Game 1
  const game1Id = 'test-game-1';
  await twitterService.tweetNewGame(
    game1Id, 
    'Player1', 
    'Player2', 
    '5+0'
  );
  console.log(`Queued new game tweet for ${game1Id}`);
  
  // Game 2  
  const game2Id = 'test-game-2';
  await twitterService.tweetNewGame(
    game2Id, 
    'Player3', 
    'Player4', 
    '10+0'
  );
  console.log(`Queued new game tweet for ${game2Id}`);
  
  // Game 3
  const game3Id = 'test-game-3';
  await twitterService.tweetNewGame(
    game3Id, 
    'Player5', 
    'Player6', 
    '3+0'
  );
  console.log(`Queued new game tweet for ${game3Id}`);
  
  // Game 4
  const game4Id = 'test-game-4';
  await twitterService.tweetNewGame(
    game4Id, 
    'Player7', 
    'Player8', 
    '1+0'
  );
  console.log(`Queued new game tweet for ${game4Id}`);
  
  // Game 5 (at the limit)
  const game5Id = 'test-game-5';
  await twitterService.tweetNewGame(
    game5Id, 
    'Player9', 
    'Player10', 
    '15+0'
  );
  console.log(`Queued new game tweet for ${game5Id}`);
  
  // Game 6 (beyond the limit, should be prioritized as it's newer)
  const game6Id = 'test-game-6';
  await twitterService.tweetNewGame(
    game6Id, 
    'Carlsen', 
    'Nakamura', 
    '5+0'
  );
  console.log(`Queued new game tweet for ${game6Id} (beyond daily limit)`);
  
  // Game 7 (beyond the limit, should be prioritized as it's newer)
  const game7Id = 'test-game-7';
  await twitterService.tweetNewGame(
    game7Id, 
    'Firouzja', 
    'Ding', 
    '5+0'
  );
  console.log(`Queued new game tweet for ${game7Id} (beyond daily limit)`);
  
  // Try game result tweet (should be ignored)
  await twitterService.tweetGameResult(
    game1Id, 
    'Player1', 
    'Player2', 
    '1-0'
  );
  console.log(`Attempted to queue game result tweet for ${game1Id} (should be ignored)`);
  
  // Try betting event tweet (should be ignored)
  await twitterService.tweetBettingEvent(
    game2Id, 
    'Huge 500 token bet placed on white win!'
  );
  console.log(`Attempted to queue betting event tweet for ${game2Id} (should be ignored)`);
  
  // Monitor the queue status
  console.log('\nMonitoring queue status...');
  
  // Check queue status every 20 seconds for 11 minutes (enough to see multiple tweets sent)
  const monitorDuration = 11 * 60 * 1000; // 11 minutes
  const startTime = Date.now();
  
  // Initial status
  let status = twitterService.getTweetQueueStatus();
  console.log(`Initial queue status: ${status.queueLength} tweets in queue, next tweet in ${status.nextTweetIn} seconds`);
  console.log(`Daily tweet count: ${status.dailyTweetCount}/${status.maxDailyTweets}, remaining today: ${status.remainingToday}`);
  
  // Set up monitoring interval
  const intervalId = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    status = twitterService.getTweetQueueStatus();
    
    console.log(`[${elapsedSeconds}s] Queue status: ${status.queueLength} tweets in queue, next tweet in ${status.nextTweetIn} seconds`);
    console.log(`Daily tweet count: ${status.dailyTweetCount}/${status.maxDailyTweets}, remaining today: ${status.remainingToday}`);
    
    // If queue is empty and we've run for the full duration, end the test
    if (status.queueLength === 0 && status.dailyTweetCount >= status.maxDailyTweets && Date.now() - startTime >= monitorDuration) {
      console.log('\nQueue is empty and daily limit reached, test complete!');
      clearInterval(intervalId);
      process.exit(0);
    }
  }, 20000); // Check every 20 seconds
  
  // Safety timeout to end the test after the monitoring duration
  setTimeout(() => {
    console.log('\nTest duration complete!');
    clearInterval(intervalId);
    
    // Final status check
    status = twitterService.getTweetQueueStatus();
    console.log(`Final queue status: ${status.queueLength} tweets in queue, next tweet in ${status.nextTweetIn} seconds`);
    console.log(`Daily tweet count: ${status.dailyTweetCount}/${status.maxDailyTweets}, remaining today: ${status.remainingToday}`);
    
    process.exit(0);
  }, monitorDuration);
}

// Run the test
testTweetQueue().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});