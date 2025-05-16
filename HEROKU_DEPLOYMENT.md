# Heroku Deployment Guide

This guide explains how to deploy the BetMate backend to Heroku.

## Prerequisites

1. A Heroku account
2. Heroku CLI installed locally
3. Git repository initialized for the backend

## Setup Process

### 1. Login to Heroku

```bash
heroku login
```

### 2. Create a Heroku app

```bash
heroku create betmate-backend
```

Or use the Heroku dashboard to create a new app.

### 3. Configure Environment Variables

Set the following environment variables in your Heroku app (via dashboard or CLI):

```bash
# Using CLI
heroku config:set AUTH_SECRET="your-auth-secret-here"
heroku config:set MONGODB_URI="your-mongodb-connection-string"
heroku config:set MICROSERVICE_API_KEY="your-microservice-api-key"
heroku config:set MICROSERVICE_URL="your-microservice-url"
heroku config:set NODE_ENV="production"
```

The MongoDB URI should point to your production MongoDB instance.

### 4. Deploy to Heroku

```bash
git push heroku main
```

### 5. Verify Deployment

```bash
heroku open
```

## Troubleshooting

- Check application logs:
  ```bash
  heroku logs --tail
  ```

- If database connection fails, verify the MONGODB_URI is correct and accessible from Heroku.

- If you encounter memory issues, consider upgrading your Heroku dyno type.

## Continuous Deployment

For continuous deployment, you can connect your GitHub repository to Heroku and enable automatic deploys from your main branch.

## Scaling

To scale your application:

```bash
heroku ps:scale web=1
```

Increase the number to add more dynos based on your requirements.