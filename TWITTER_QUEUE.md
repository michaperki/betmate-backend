# Twitter Queue Implementation

This document explains the implementation of the Twitter queue system, which limits tweets about new games to 5 per day.

## Overview

The Twitter queue manager is designed to:
- Queue tweets ONLY about new games (no game results or betting events)
- Limit tweets to a maximum of 5 per day
- Space them out with a minimum time interval (default: 30 minutes)
- Prioritize newer games over older ones
- Create a more focused Twitter presence with less noise

## Implementation Details

### Core Components

1. **Tweet Queue Manager** (`/src/helpers/tweet_queue.ts`)
   - Manages the queue of tweets to be sent
   - Processes the queue at regular intervals
   - Enforces daily tweet limit and minimum time between tweets
   - Prioritizes newer games when selecting which to tweet

2. **Twitter Service Integration** (`/src/services/twitter_service.ts`)
   - Simplified to only support new game tweets
   - Provides method to queue tweets about new games
   - Placeholder stubs for deprecated game result and betting event tweets
   - Exposes queue status information

3. **API Endpoints** 
   - Status endpoint to check if Twitter is configured
   - Queue status endpoint to monitor the tweet queue
   - Endpoints for queuing different types of tweets (only new game tweets are processed)

## How It Works

1. When a new game starts, the tweet is queued (not sent immediately)
2. A background process checks the queue every 10 seconds
3. If it's been at least 30 minutes since the last tweet and we haven't reached the daily limit of 5 tweets, the newest game in the queue is tweeted
4. The daily counter resets at midnight
5. If there are more games than the daily limit allows, the system prioritizes newer games

## Configuration

The tweet manager is configured with:
- 30 minute spacing between tweets
- 5 tweet maximum per day

These can be adjusted in the `tweet_queue.ts` file:

```typescript
// Create a singleton instance with 30 minute spacing between tweets and 5 max daily tweets
const tweetQueue = new TweetQueueManager(30, 5);
```

## Testing

A test script is provided to verify the tweet queue functionality:

```bash
# In the backend directory
node test-twitter-queue.js
```

The test script:
- Queues multiple test tweets
- Monitors the queue status every 20 seconds
- Runs for 11 minutes to observe tweets being sent
- Displays queue statistics throughout the test

## API Endpoints

### Check Twitter Configuration
```
GET /api/twitter/status
```

### Get Queue Status
```
GET /api/twitter/queue
```
Returns:
```json
{
  "success": true,
  "queueStatus": {
    "queueLength": 3,
    "nextTweetIn": 245,
    "dailyTweetCount": 2,
    "maxDailyTweets": 5,
    "remainingToday": 3
  }
}
```

### Queue a New Game Tweet
```
POST /api/twitter/tweet/game
```
Body:
```json
{
  "gameId": "game123",
  "whitePlayer": "Magnus",
  "blackPlayer": "Hikaru",
  "timeControl": "5+0"
}
```