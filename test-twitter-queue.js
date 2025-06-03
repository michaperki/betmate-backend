/**
 * Test script for Twitter queue functionality
 * 
 * This script tests the tweet queue implementation by queuing multiple tweets
 * and checking if they are properly spaced out over time.
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
  
  // Queue a series of test tweets
  console.log('\nQueuing test tweets...');
  
  // Game 1 - New game and result
  const game1Id = 'test-game-1';
  await twitterService.tweetNewGame(
    game1Id, 
    'Player1', 
    'Player2', 
    '5+0'
  );
  console.log(`Queued new game tweet for ${game1Id}`);
  
  // Game 2 - New game and result  
  const game2Id = 'test-game-2';
  await twitterService.tweetNewGame(
    game2Id, 
    'Player3', 
    'Player4', 
    '10+0'
  );
  console.log(`Queued new game tweet for ${game2Id}`);
  
  // Game 1 result
  await twitterService.tweetGameResult(
    game1Id, 
    'Player1', 
    'Player2', 
    '1-0'
  );
  console.log(`Queued game result tweet for ${game1Id}`);
  
  // Betting event
  await twitterService.tweetBettingEvent(
    game2Id, 
    'Huge 500 token bet placed on white win!'
  );
  console.log(`Queued betting event tweet for ${game2Id}`);
  
  // Game 2 result  
  await twitterService.tweetGameResult(
    game2Id, 
    'Player3', 
    'Player4', 
    '0-1'
  );
  console.log(`Queued game result tweet for ${game2Id}`);
  
  // Monitor the queue status
  console.log('\nMonitoring queue status...');
  
  // Check queue status every 20 seconds for 11 minutes (enough to see multiple tweets sent)
  const monitorDuration = 11 * 60 * 1000; // 11 minutes
  const startTime = Date.now();
  
  // Initial status
  let status = twitterService.getTweetQueueStatus();
  console.log(`Initial queue status: ${status.queueLength} tweets in queue, next tweet in ${status.nextTweetIn} seconds`);
  
  // Set up monitoring interval
  const intervalId = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    status = twitterService.getTweetQueueStatus();
    
    console.log(`[${elapsedSeconds}s] Queue status: ${status.queueLength} tweets in queue, next tweet in ${status.nextTweetIn} seconds`);
    
    // If queue is empty and we've run for the full duration, end the test
    if (status.queueLength === 0 && Date.now() - startTime >= monitorDuration) {
      console.log('\nQueue is empty, test complete!');
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
    
    process.exit(0);
  }, monitorDuration);
}

// Run the test
testTweetQueue().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});