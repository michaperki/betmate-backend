# Twitter Integration

This document provides guidance on setting up the Twitter integration for BetMate.

## Required Environment Variables

The Twitter bot requires the following environment variables to be set in your Heroku environment:

### OAuth 1.0a Credentials (Recommended for full API access)

```
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret
```

### OAuth 2.0 Credentials (Alternative, limited to v2 API)

```
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
```

## Getting Twitter API Credentials

1. Go to the [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new project and app
3. Apply for Elevated access (needed for v1.1 API endpoints)
4. Generate OAuth 1.0a credentials:
   - From your app settings, navigate to "Keys and tokens"
   - Generate "Consumer Keys" (API Key and Secret)
   - Generate "Access Token and Secret"
5. Add these credentials to your Heroku environment variables

## Features Implemented

The Twitter bot will automatically tweet for the following events:

1. New games starting
2. Game results
3. Significant betting events

## Testing the Twitter Integration

To test the Twitter integration locally:

1. Add the environment variables to your local `.env` file
2. Run the backend server: `yarn dev`
3. Trigger a new game or game result event

## Troubleshooting

If tweets are not being sent:

1. Check that all required environment variables are set correctly
2. Verify that your Twitter API credentials have the proper permissions
3. Check the application logs for any Twitter API errors

## Rate Limits

The Twitter API has rate limits that may affect how frequently the application can tweet. By default, the API allows 300 tweets per 3-hour window for OAuth 1.0a and 200 tweets per 15-minute window for OAuth 2.0.

For more information, see the [Twitter API rate limits](https://developer.twitter.com/en/docs/twitter-api/rate-limits).