/**
 * Tweet Queue Manager
 * 
 * Handles queuing and spacing out tweets for game starts.
 * Limits to a maximum of 5 tweets per day.
 * Only tweets about new games, not game results or betting events.
 */

import logger from './axiom_logger';

// Types for tweet queue management
interface QueuedTweet {
  id: string;
  payload: {
    whitePlayer: string;
    blackPlayer: string;
    timeControl: string;
  };
  timestamp: number;
  tweetFunction: (gameId: string, ...args: any[]) => Promise<any>;
}

class TweetQueueManager {
  private queue: QueuedTweet[] = [];
  private isProcessing: boolean = false;
  private minTimeBetweenTweets: number = 30 * 60 * 1000; // 30 minutes by default
  private lastTweetTime: number = 0;
  private dailyTweetCount: number = 0;
  private maxDailyTweets: number = 5;
  private lastResetDate: string = ''; // Track the date for resetting daily count

  /**
   * Initialize the tweet queue manager
   * @param minTimeInMinutes Minimum time between tweets in minutes
   * @param maxTweetsPerDay Maximum tweets allowed per day
   */
  constructor(minTimeInMinutes: number = 30, maxTweetsPerDay: number = 5) {
    this.minTimeBetweenTweets = minTimeInMinutes * 60 * 1000;
    this.maxDailyTweets = maxTweetsPerDay;
    
    // Set initial reset date
    this.lastResetDate = this.getCurrentDate();
    
    // Start the queue processing loop
    this.processQueue();
    
    logger.info(`Tweet queue manager initialized with ${minTimeInMinutes} minute spacing and ${maxTweetsPerDay} max daily tweets`);
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  private getCurrentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * Check if we should reset the daily counter
   */
  private checkResetDailyCounter(): void {
    const currentDate = this.getCurrentDate();
    
    if (currentDate !== this.lastResetDate) {
      logger.info(`Resetting daily tweet counter. Previous: ${this.dailyTweetCount} tweets on ${this.lastResetDate}`);
      this.dailyTweetCount = 0;
      this.lastResetDate = currentDate;
    }
  }

  /**
   * Add a tweet to the queue
   * @param id Unique identifier (usually gameId)
   * @param payload The data needed for the tweet
   * @param tweetFunction The function to call to actually send the tweet
   */
  public queueTweet(
    id: string,
    payload: { whitePlayer: string; blackPlayer: string; timeControl: string },
    tweetFunction: (gameId: string, ...args: any[]) => Promise<any>
  ): void {
    this.checkResetDailyCounter();
    
    // If we already reached our daily limit, don't add more tweets to the queue
    if (this.dailyTweetCount >= this.maxDailyTweets) {
      logger.info(`Daily tweet limit (${this.maxDailyTweets}) reached. Not queuing tweet for game ${id}`);
      return;
    }
    
    // Check if a tweet with this ID is already in the queue
    const existingIndex = this.queue.findIndex(tweet => tweet.id === id);
    
    if (existingIndex !== -1) {
      // Update the existing entry instead of adding a duplicate
      this.queue[existingIndex] = {
        id,
        payload,
        timestamp: Date.now(),
        tweetFunction
      };
      logger.info(`Updated queued tweet for game ID: ${id}`);
    } else {
      // Add a new entry to the queue
      this.queue.push({
        id,
        payload,
        timestamp: Date.now(),
        tweetFunction
      });
      logger.info(`Queued new tweet for game ID: ${id}`);
    }
    
    // Limit queue size to the number of remaining daily tweets
    const remainingDailyTweets = this.maxDailyTweets - this.dailyTweetCount;
    
    if (this.queue.length > remainingDailyTweets) {
      // Sort by timestamp (newest first) and keep only the newest ones
      this.queue.sort((a, b) => b.timestamp - a.timestamp);
      
      // Remove oldest tweets that exceed our limit
      const removedCount = this.queue.length - remainingDailyTweets;
      if (removedCount > 0) {
        this.queue = this.queue.slice(0, remainingDailyTweets);
        logger.info(`Daily tweet limit approaching. Removed ${removedCount} oldest tweets from queue`);
      }
    }
    
    // Log the current queue state
    logger.info(`Current tweet queue length: ${this.queue.length}, Daily tweet count: ${this.dailyTweetCount}/${this.maxDailyTweets}`);
  }

  /**
   * Process the tweet queue at regular intervals
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      // Either already processing or nothing to process
      setTimeout(() => this.processQueue(), 10000); // Check again in 10 seconds
      return;
    }

    this.isProcessing = true;
    
    try {
      const now = Date.now();
      
      // Check and reset daily counter if needed
      this.checkResetDailyCounter();
      
      // Check if we've hit the daily limit
      if (this.dailyTweetCount >= this.maxDailyTweets) {
        logger.info(`Daily tweet limit (${this.maxDailyTweets}) reached. Waiting until tomorrow to send more tweets.`);
        this.isProcessing = false;
        setTimeout(() => this.processQueue(), 60000); // Check again in 1 minute
        return;
      }
      
      // Check if enough time has passed since the last tweet
      if (now - this.lastTweetTime >= this.minTimeBetweenTweets) {
        // Sort the queue by timestamp (newest first) to prioritize newer games
        this.queue.sort((a, b) => b.timestamp - a.timestamp);
        
        // Get the newest tweet from the queue
        const tweetToSend = this.queue.shift();
        
        if (tweetToSend) {
          logger.info(`Processing tweet for game ID: ${tweetToSend.id}`);
          
          try {
            // Call the tweet function with the appropriate parameters
            const result = await tweetToSend.tweetFunction(
              tweetToSend.id,
              tweetToSend.payload.whitePlayer,
              tweetToSend.payload.blackPlayer,
              tweetToSend.payload.timeControl
            );
            
            if (result) {
              this.lastTweetTime = Date.now();
              this.dailyTweetCount++;
              logger.info(`Successfully sent tweet for game ID: ${tweetToSend.id}. Daily count: ${this.dailyTweetCount}/${this.maxDailyTweets}`);
            } else {
              logger.warn(`Failed to send tweet for game ID: ${tweetToSend.id}`);
            }
          } catch (error) {
            logger.error(`Error sending tweet for game ID: ${tweetToSend.id}:`, error);
          }
        }
      } else {
        const waitTime = this.minTimeBetweenTweets - (now - this.lastTweetTime);
        logger.info(`Waiting ${Math.ceil(waitTime / 1000)} seconds before sending next tweet`);
      }
    } catch (error) {
      logger.error('Error processing tweet queue:', error);
    } finally {
      this.isProcessing = false;
      
      // Continue processing the queue after a delay
      setTimeout(() => this.processQueue(), 10000); // Check again in 10 seconds
    }
  }

  /**
   * Get the current queue status
   */
  public getQueueStatus(): { 
    queueLength: number, 
    nextTweetIn: number,
    dailyTweetCount: number,
    maxDailyTweets: number,
    remainingToday: number
  } {
    this.checkResetDailyCounter();
    
    const now = Date.now();
    const timeSinceLastTweet = now - this.lastTweetTime;
    const nextTweetIn = Math.max(0, this.minTimeBetweenTweets - timeSinceLastTweet);
    
    return {
      queueLength: this.queue.length,
      nextTweetIn: Math.ceil(nextTweetIn / 1000), // in seconds
      dailyTweetCount: this.dailyTweetCount,
      maxDailyTweets: this.maxDailyTweets,
      remainingToday: Math.max(0, this.maxDailyTweets - this.dailyTweetCount)
    };
  }
}

// Create a singleton instance with 30 minute spacing between tweets and 5 max daily tweets
const tweetQueue = new TweetQueueManager(30, 5);

export default tweetQueue;