# Raffle System EventBridge Setup

This document explains how to wire the Raffle Draw Lambda functions to AWS EventBridge for automated weekly and monthly raffle execution.

## Overview

The raffle system requires automated execution of the `runRaffleDraw` Lambda function on a scheduled basis:
- **Weekly raffles**: Every Sunday at 11:59 PM UTC
- **Monthly raffles**: Last day of each month at 11:59 PM UTC

## EventBridge Rules Configuration

### 1. Weekly Raffle Rule

```json
{
  "Name": "betmate-weekly-raffle-trigger",
  "Description": "Triggers weekly raffle draw every Sunday at 11:59 PM UTC",
  "ScheduleExpression": "cron(59 23 ? * SUN *)",
  "State": "ENABLED",
  "Targets": [
    {
      "Id": "1",
      "Arn": "arn:aws:lambda:REGION:ACCOUNT_ID:function:runRaffleDraw",
      "Input": "{\"drawPeriod\": \"weekly\"}"
    }
  ]
}
```

### 2. Monthly Raffle Rule

```json
{
  "Name": "betmate-monthly-raffle-trigger",
  "Description": "Triggers monthly raffle draw on the last day of each month at 11:59 PM UTC",
  "ScheduleExpression": "cron(59 23 L * ? *)",
  "State": "ENABLED",
  "Targets": [
    {
      "Id": "1",
      "Arn": "arn:aws:lambda:REGION:ACCOUNT_ID:function:runRaffleDraw",
      "Input": "{\"drawPeriod\": \"monthly\"}"
    }
  ]
}
```

## AWS CLI Commands

### Create Weekly Raffle Rule

```bash
# Create the rule
aws events put-rule \
  --name betmate-weekly-raffle-trigger \
  --description "Triggers weekly raffle draw every Sunday at 11:59 PM UTC" \
  --schedule-expression "cron(59 23 ? * SUN *)" \
  --state ENABLED

# Add Lambda target
aws events put-targets \
  --rule betmate-weekly-raffle-trigger \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT_ID:function:runRaffleDraw","Input"='{"drawPeriod": "weekly"}'

# Grant permission for EventBridge to invoke the Lambda
aws lambda add-permission \
  --function-name runRaffleDraw \
  --statement-id weekly-raffle-trigger \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:REGION:ACCOUNT_ID:rule/betmate-weekly-raffle-trigger
```

### Create Monthly Raffle Rule

```bash
# Create the rule
aws events put-rule \
  --name betmate-monthly-raffle-trigger \
  --description "Triggers monthly raffle draw on the last day of each month at 11:59 PM UTC" \
  --schedule-expression "cron(59 23 L * ? *)" \
  --state ENABLED

# Add Lambda target
aws events put-targets \
  --rule betmate-monthly-raffle-trigger \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT_ID:function:runRaffleDraw","Input"='{"drawPeriod": "monthly"}'

# Grant permission for EventBridge to invoke the Lambda
aws lambda add-permission \
  --function-name runRaffleDraw \
  --statement-id monthly-raffle-trigger \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:REGION:ACCOUNT_ID:rule/betmate-monthly-raffle-trigger
```

## Terraform Configuration

If using Terraform for infrastructure as code:

```hcl
# Weekly raffle EventBridge rule
resource "aws_cloudwatch_event_rule" "weekly_raffle_trigger" {
  name                = "betmate-weekly-raffle-trigger"
  description         = "Triggers weekly raffle draw every Sunday at 11:59 PM UTC"
  schedule_expression = "cron(59 23 ? * SUN *)"
  is_enabled          = true
}

resource "aws_cloudwatch_event_target" "weekly_raffle_target" {
  rule      = aws_cloudwatch_event_rule.weekly_raffle_trigger.name
  target_id = "WeeklyRaffleTarget"
  arn       = aws_lambda_function.run_raffle_draw.arn
  input     = jsonencode({
    drawPeriod = "weekly"
  })
}

resource "aws_lambda_permission" "allow_weekly_raffle_trigger" {
  statement_id  = "AllowExecutionFromWeeklyRaffleTrigger"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.run_raffle_draw.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_raffle_trigger.arn
}

# Monthly raffle EventBridge rule
resource "aws_cloudwatch_event_rule" "monthly_raffle_trigger" {
  name                = "betmate-monthly-raffle-trigger"
  description         = "Triggers monthly raffle draw on the last day of each month at 11:59 PM UTC"
  schedule_expression = "cron(59 23 L * ? *)"
  is_enabled          = true
}

resource "aws_cloudwatch_event_target" "monthly_raffle_target" {
  rule      = aws_cloudwatch_event_rule.monthly_raffle_trigger.name
  target_id = "MonthlyRaffleTarget"
  arn       = aws_lambda_function.run_raffle_draw.arn
  input     = jsonencode({
    drawPeriod = "monthly"
  })
}

resource "aws_lambda_permission" "allow_monthly_raffle_trigger" {
  statement_id  = "AllowExecutionFromMonthlyRaffleTrigger"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.run_raffle_draw.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_raffle_trigger.arn
}
```

## CloudFormation Template

```yaml
WeeklyRaffleTrigger:
  Type: AWS::Events::Rule
  Properties:
    Name: betmate-weekly-raffle-trigger
    Description: Triggers weekly raffle draw every Sunday at 11:59 PM UTC
    ScheduleExpression: cron(59 23 ? * SUN *)
    State: ENABLED
    Targets:
      - Id: WeeklyRaffleTarget
        Arn: !GetAtt RunRaffleDrawFunction.Arn
        Input: '{"drawPeriod": "weekly"}'

MonthlyRaffleTrigger:
  Type: AWS::Events::Rule
  Properties:
    Name: betmate-monthly-raffle-trigger
    Description: Triggers monthly raffle draw on the last day of each month at 11:59 PM UTC
    ScheduleExpression: cron(59 23 L * ? *)
    State: ENABLED
    Targets:
      - Id: MonthlyRaffleTarget
        Arn: !GetAtt RunRaffleDrawFunction.Arn
        Input: '{"drawPeriod": "monthly"}'

WeeklyRaffleLambdaPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref RunRaffleDrawFunction
    Action: lambda:InvokeFunction
    Principal: events.amazonaws.com
    SourceArn: !GetAtt WeeklyRaffleTrigger.Arn

MonthlyRaffleLambdaPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref RunRaffleDrawFunction
    Action: lambda:InvokeFunction
    Principal: events.amazonaws.com
    SourceArn: !GetAtt MonthlyRaffleTrigger.Arn
```

## Cron Expression Breakdown

### Weekly: `cron(59 23 ? * SUN *)`
- **59**: Minute (59th minute)
- **23**: Hour (11 PM in 24-hour format)
- **?**: Day of month (ignored when day of week is specified)
- *****: Month (every month)
- **SUN**: Day of week (Sunday)
- *****: Year (every year)

### Monthly: `cron(59 23 L * ? *)`
- **59**: Minute (59th minute)
- **23**: Hour (11 PM in 24-hour format)
- **L**: Day of month (last day of the month)
- *****: Month (every month)
- **?**: Day of week (ignored when day of month is specified)
- *****: Year (every year)

## Pre-requisites Setup

Before setting up the EventBridge rules, ensure you have:

1. **Database Pre-population**: Create upcoming raffle draw records
2. **Lambda Deployment**: Deploy the `runRaffleDraw` function
3. **IAM Permissions**: Ensure Lambda has necessary database permissions

### Database Pre-population Script

```sql
-- Create upcoming weekly draws for the next 12 weeks
INSERT INTO raffle_draws (id, period, start_date, end_date, cutoff_date, status)
SELECT 
  gen_random_uuid(),
  'WEEKLY',
  date_trunc('week', CURRENT_DATE) + interval '7 days' * generate_series(0, 11),
  date_trunc('week', CURRENT_DATE) + interval '7 days' * generate_series(1, 12) - interval '1 second',
  date_trunc('week', CURRENT_DATE) + interval '7 days' * generate_series(1, 12) - interval '1 second',
  'UPCOMING';

-- Create upcoming monthly draws for the next 12 months
INSERT INTO raffle_draws (id, period, start_date, end_date, cutoff_date, status)
SELECT 
  gen_random_uuid(),
  'MONTHLY',
  date_trunc('month', CURRENT_DATE) + interval '1 month' * generate_series(0, 11),
  date_trunc('month', CURRENT_DATE) + interval '1 month' * generate_series(1, 12) - interval '1 second',
  date_trunc('month', CURRENT_DATE) + interval '1 month' * generate_series(1, 12) - interval '1 second',
  'UPCOMING';
```

## Monitoring and Alerts

Set up CloudWatch alarms to monitor raffle execution:

```bash
# Create alarm for failed raffle executions
aws cloudwatch put-metric-alarm \
  --alarm-name "RaffleDrawExecutionFailures" \
  --alarm-description "Alert when raffle draw executions fail" \
  --metric-name "Errors" \
  --namespace "AWS/Lambda" \
  --statistic "Sum" \
  --period 300 \
  --threshold 1 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --dimensions Name=FunctionName,Value=runRaffleDraw \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:REGION:ACCOUNT_ID:raffle-alerts"
```

## Troubleshooting

### Common Issues

1. **Lambda Not Triggered**: Check EventBridge rule is enabled and Lambda permissions are correct
2. **Wrong Timezone**: EventBridge uses UTC; adjust cron expressions accordingly
3. **Missing Draw Records**: Ensure database is pre-populated with upcoming draws
4. **Permission Errors**: Verify Lambda execution role has database access

### Debugging Commands

```bash
# List EventBridge rules
aws events list-rules --name-prefix betmate-

# Check rule targets
aws events list-targets-by-rule --rule betmate-weekly-raffle-trigger

# View Lambda function configuration
aws lambda get-function --function-name runRaffleDraw

# Check recent Lambda invocations
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/runRaffleDraw
```

## Security Considerations

1. **Least Privilege**: Lambda execution role should have minimal required permissions
2. **VPC Configuration**: If database is in VPC, configure Lambda VPC settings
3. **Secrets Management**: Use AWS Secrets Manager for database credentials
4. **Monitoring**: Enable CloudTrail logging for EventBridge rule changes

## Testing

Test the setup manually before enabling automatic scheduling:

```bash
# Manually trigger the Lambda function
aws lambda invoke \
  --function-name runRaffleDraw \
  --payload '{"drawPeriod": "weekly"}' \
  response.json

# Check the response
cat response.json
```

This setup ensures reliable, automated execution of raffle draws while maintaining security and observability best practices.