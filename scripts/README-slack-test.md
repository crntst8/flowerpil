# Slack Notification Test Script

## Overview

Quick test script to verify Slack integration for Apple Music export notifications.

## Location

`scripts/test-slack-notification.js`

## Purpose

- Verify Slack environment variables are configured correctly
- Test basic message sending
- Test rich Apple Music export notification format
- Test failure notification format

## Prerequisites

1. **Environment Variables**: Slack credentials must be configured in your `ecosystem.config.cjs` or `.env` file:
   ```javascript
   SLACK_ACCESS_TOKEN=YOUR_SLACK_ACCESS_TOKEN
   SLACK_REFRESH_TOKEN=YOUR_SLACK_REFRESH_TOKEN
   SLACK_CLIENT_ID=YOUR_SLACK_CLIENT_ID
   SLACK_CLIENT_SECRET=YOUR_SLACK_CLIENT_SECRET
   SLACK_CHANNEL_ID=YOUR_SLACK_CHANNEL_ID
   SLACK_NOTIFICATIONS_ENABLED=true
   ```

2. **Slack App Setup**: The Slack app must be added to your `#export-alerts` channel:
   - Open Slack
   - Go to `#export-alerts` channel
   - Type `/invite @export-alert` (or your app name)
   - Confirm the app has `chat:write` permission

## Usage

### Run the test

```bash
node scripts/test-slack-notification.js
```

### Expected Output

```
🧪 Testing Slack Notification Integration

📋 Configuration Check:
  SLACK_NOTIFICATIONS_ENABLED: true
  SLACK_ACCESS_TOKEN: ***
  SLACK_CHANNEL_ID: YOUR_CHANNEL_ID
  SLACK_CLIENT_ID: YOUR_CLIENT_ID

✅ Slack configuration looks good!

📤 Test 1: Sending simple test message...
✅ Test 1 passed! Simple message sent successfully.
   Message timestamp: 1234567890.123456

📤 Test 2: Sending rich Apple Music export notification...
✅ Test 2 passed! Rich notification sent successfully.
   Message timestamp: 1234567890.123457

📤 Test 3: Sending resolution failure notification...
✅ Test 3 passed! Failure notification sent successfully.
   Message timestamp: 1234567890.123458

🎉 All tests completed successfully!

📱 Check your Slack channel (#export-alerts) to verify messages arrived.
```

## What Gets Tested

### Test 1: Simple Message
Sends a plain text message to verify basic connectivity.

### Test 2: Apple Music Export Success
Sends a rich notification with:
- Playlist title and ID
- Curator name
- Apple library ID
- Buttons for dashboard and Apple Music
- Formatted as actual export notification

### Test 3: Resolution Failure
Sends a failure notification showing:
- Failed resolution details
- Attempt count
- Error message
- Formatted as actual failure alert

## Troubleshooting

### ❌ "Slack is not properly configured"

**Cause**: Missing or incomplete environment variables

**Solution**:
1. Check `ecosystem.config.cjs` or `.env` has all required Slack variables
2. Restart your server after adding variables
3. Verify no typos in variable names

### ❌ "invalid_auth" or "token_expired"

**Cause**: Access token is invalid or expired

**Solution**:
1. Check if `SLACK_ACCESS_TOKEN` is correct
2. Token may have expired - let script attempt refresh
3. If refresh fails, regenerate tokens in Slack app dashboard

### ❌ "channel_not_found"

**Cause**: Channel ID is incorrect or app not added to channel

**Solution**:
1. Verify `SLACK_CHANNEL_ID` matches your `#export-alerts` channel
2. Add app to channel: `/invite @export-alert` in Slack
3. Get channel ID from Slack: Right-click channel → View details → Copy ID

### ✅ Tests pass but no messages in Slack

**Cause**: App not added to channel or wrong channel ID

**Solution**:
1. Open Slack and check `#export-alerts` channel
2. Look for the app in channel members list
3. Try `/invite @export-alert` if not present
4. Verify channel ID is correct

### ⚠️ "Message not sent (notifications may be disabled)"

**Cause**: `SLACK_NOTIFICATIONS_ENABLED=false`

**Solution**:
Set `SLACK_NOTIFICATIONS_ENABLED=true` in your environment config

## Integration with Real Exports

Once this test passes, real Apple Music exports will automatically:

1. Export playlist to Apple Music (creates library playlist)
2. Detect no share URL is available
3. Send Slack notification to `#export-alerts`
4. Queue URL resolution job
5. Poll Apple Music API for share URL

The notification will look exactly like Test 2, but with real playlist data.

## Development Workflow

```bash
# 1. Configure environment variables
vi ecosystem.config.cjs  # or .env

# 2. Run test script
node scripts/test-slack-notification.js

# 3. Check Slack for messages
# Open #export-alerts channel

# 4. If tests pass, proceed with real export test
# Export a playlist to Apple Music via curator dashboard

# 5. Verify notification arrives in Slack
# Should appear within seconds of export completing
```

## Next Steps After Testing

1. ✅ Test script passes
2. ✅ Messages appear in Slack
3. 🔄 Test real Apple Music export
4. 🔄 Manually share playlist in Apple Music app
5. 🔄 Verify URL resolver detects share URL
6. ✅ System working end-to-end

## Related Documentation

- `llm/cc/apple-share-notifications/IMPLEMENTATION_SUMMARY.md` - Full feature overview
- `llm/cc/apple-share-notifications/ENV_SETUP.md` - Environment configuration guide
- `server/services/SlackNotificationService.js` - Service implementation
- `docs/features/testing.md` - General testing guide

## Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs`
2. Look for `[SLACK_SERVICE]` log entries
3. Verify environment variables are loaded: `echo $SLACK_CHANNEL_ID`
4. Test Slack API directly: `curl -X POST https://slack.com/api/chat.postMessage -H "Authorization: Bearer $SLACK_ACCESS_TOKEN" -d "channel=$SLACK_CHANNEL_ID&text=test"`
