/**
 * Tweet Queue Manager
 * 
 * Handles queuing and spacing out tweets to avoid flooding the Twitter timeline.
 * This helps maintain a more natural tweet cadence and prevents overwhelming followers.
 */

import logger from './axiom_logger';

// Types for tweet queue management
interface QueuedTweet {
  id: string;
  type: 'new_game' | 'game_result' | 'betting_event';
  payload: any;
  timestamp: number;
  tweetFunction: (gameId: string, ...args: any[]) => Promise<any>;
}

class TweetQueueManager {
  private queue: QueuedTweet[] = [];
  private isProcessing: boolean = false;
  private minTimeBetweenTweets: number = 5 * 60 * 1000; // 5 minutes by default
  private lastTweetTime: number = 0;

  /**
   * Initialize the tweet queue manager
   * @param minTimeInMinutes Minimum time between tweets in minutes
   */
  constructor(minTimeInMinutes: number = 5) {
    this.minTimeBetweenTweets = minTimeInMinutes * 60 * 1000;
    
    // Start the queue processing loop
    this.processQueue();
    
    logger.info(`Tweet queue manager initialized with ${minTimeInMinutes} minute spacing`);
  }

  /**
   * Add a tweet to the queue
   * @param id Unique identifier (usually gameId)
   * @param type Type of tweet
   * @param payload The data needed for the tweet
   * @param tweetFunction The function to call to actually send the tweet
   */
  public queueTweet(
    id: string,
    type: 'new_game' | 'game_result' | 'betting_event',
    payload: any,
    tweetFunction: (gameId: string, ...args: any[]) => Promise<any>
  ): void {
    // Check if a tweet with this ID and type is already in the queue
    const existingIndex = this.queue.findIndex(tweet => tweet.id === id && tweet.type === type);
    
    if (existingIndex !== -1) {
      // Update the existing entry instead of adding a duplicate
      this.queue[existingIndex] = {
        id,
        type,
        payload,
        timestamp: Date.now(),
        tweetFunction
      };
      logger.info(`Updated queued ${type} tweet for ID: ${id}`);
    } else {
      // Add a new entry to the queue
      this.queue.push({
        id,
        type,
        payload,
        timestamp: Date.now(),
        tweetFunction
      });
      logger.info(`Queued new ${type} tweet for ID: ${id}`);
    }
    
    // Log the current queue state
    logger.info(`Current tweet queue length: ${this.queue.length}`);
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
      
      // Check if enough time has passed since the last tweet
      if (now - this.lastTweetTime >= this.minTimeBetweenTweets) {
        // Sort the queue by timestamp (oldest first)
        this.queue.sort((a, b) => a.timestamp - b.timestamp);
        
        // Get the oldest tweet from the queue
        const tweetToSend = this.queue.shift();
        
        if (tweetToSend) {
          logger.info(`Processing ${tweetToSend.type} tweet for ID: ${tweetToSend.id}`);
          
          try {
            // Call the tweet function with the appropriate parameters
            const result = await this.sendTweet(tweetToSend);
            
            if (result) {
              this.lastTweetTime = Date.now();
              logger.info(`Successfully sent ${tweetToSend.type} tweet for ID: ${tweetToSend.id}`);
            } else {
              logger.warn(`Failed to send ${tweetToSend.type} tweet for ID: ${tweetToSend.id}`);
            }
          } catch (error) {
            logger.error(`Error sending ${tweetToSend.type} tweet for ID: ${tweetToSend.id}:`, error);
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
   * Send a tweet based on its type
   * @param tweet The queued tweet to send
   */
  private async sendTweet(tweet: QueuedTweet): Promise<any> {
    try {
      const { id, type, payload, tweetFunction } = tweet;
      
      switch (type) {
        case 'new_game':
          return await tweetFunction(
            id,
            payload.whitePlayer,
            payload.blackPlayer,
            payload.timeControl
          );
        
        case 'game_result':
          return await tweetFunction(
            id,
            payload.whitePlayer,
            payload.blackPlayer,
            payload.result
          );
          
        case 'betting_event':
          return await tweetFunction(
            id,
            payload.message
          );
          
        default:
          logger.warn(`Unknown tweet type: ${type}`);
          return null;
      }
    } catch (error) {
      logger.error('Error sending tweet:', error);
      return null;
    }
  }

  /**
   * Get the current queue status
   */
  public getQueueStatus(): { 
    queueLength: number, 
    nextTweetIn: number 
  } {
    const now = Date.now();
    const timeSinceLastTweet = now - this.lastTweetTime;
    const nextTweetIn = Math.max(0, this.minTimeBetweenTweets - timeSinceLastTweet);
    
    return {
      queueLength: this.queue.length,
      nextTweetIn: Math.ceil(nextTweetIn / 1000) // in seconds
    };
  }
}

// Create a singleton instance with 10 minute spacing between tweets
const tweetQueue = new TweetQueueManager(10);

export default tweetQueue;