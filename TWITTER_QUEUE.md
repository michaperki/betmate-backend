# Twitter Queue Implementation

This document explains the implementation of the Twitter queue system, which spaces out tweets to avoid flooding the Twitter timeline.

## Overview

The Twitter queue manager is designed to:
- Queue tweets about new games, game results, and betting events
- Space them out with a minimum time interval (default: 10 minutes) 
- Ensure tweets are sent in a natural cadence
- Prevent overwhelming followers with too many tweets at once

## Implementation Details

### Core Components

1. **Tweet Queue Manager** (`/src/helpers/tweet_queue.ts`)
   - Manages the queue of tweets to be sent
   - Processes the queue at regular intervals
   - Enforces minimum time between tweets
   - Provides queue status information

2. **Twitter Service Integration** (`/src/services/twitter_service.ts`)
   - Modified to queue tweets instead of sending them immediately
   - Provides methods to queue different types of tweets
   - Exposes queue status information

3. **API Endpoints** 
   - Status endpoint to check if Twitter is configured
   - Queue status endpoint to monitor the tweet queue
   - Endpoints for queuing different types of tweets

## How It Works

1. When a new game starts or ends, the tweet is not sent immediately
2. Instead, it's added to a queue with metadata about tweet type and content
3. A background process checks the queue every 10 seconds
4. If it's been at least 10 minutes since the last tweet, the oldest tweet is sent
5. The system continues processing tweets at the specified interval

## Configuration

The minimum time between tweets is set to 10 minutes by default. This can be adjusted in the `tweet_queue.ts` file:

```typescript
// Create a singleton instance with 10 minute spacing between tweets
const tweetQueue = new TweetQueueManager(10);
```

## Testing

A test script is provided to verify the tweet queue functionality:

```bash
# In the backend directory
node test-twitter-queue.js
```

The test script:
- Queues multiple test tweets of different types
- Monitors the queue status every 20 seconds
- Runs for 11 minutes to observe multiple tweets being sent
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
    "nextTweetIn": 245
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

### Queue a Game Result Tweet
```
POST /api/twitter/tweet/result
```
Body:
```json
{
  "gameId": "game123",
  "whitePlayer": "Magnus",
  "blackPlayer": "Hikaru",
  "result": "1-0"
}
```

### Queue a Betting Event Tweet
```
POST /api/twitter/tweet/betting
```
Body:
```json
{
  "gameId": "game123",
  "message": "Huge 500 token bet placed on white win!"
}
```