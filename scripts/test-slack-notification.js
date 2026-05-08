#!/usr/bin/env node

/**
 * Test Slack Notification
 *
 * Quick script to verify Slack integration is working correctly.
 * Sends a test notification to the configured Slack channel.
 *
 * Usage:
 *   node scripts/test-slack-notification.js
 *
 * Prerequisites:
 *   - Slack environment variables configured in ecosystem.config.cjs
 *   - Slack app added to #export-alerts channel
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import slackService from '../server/services/SlackNotificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

console.log('🧪 Testing Slack Notification Integration\n');

// Check configuration
console.log('📋 Configuration Check:');
console.log('  SLACK_NOTIFICATIONS_ENABLED:', process.env.SLACK_NOTIFICATIONS_ENABLED || 'not set');
console.log('  SLACK_ACCESS_TOKEN:', process.env.SLACK_ACCESS_TOKEN ? `${process.env.SLACK_ACCESS_TOKEN.substring(0, 20)}...` : 'not set');
console.log('  SLACK_CHANNEL_ID:', process.env.SLACK_CHANNEL_ID || 'not set');
console.log('  SLACK_CLIENT_ID:', process.env.SLACK_CLIENT_ID || 'not set');
console.log('');

if (!slackService.isConfigured()) {
  console.error('❌ Slack is not properly configured!');
  console.error('   Please check your environment variables in ecosystem.config.cjs or .env\n');
  console.error('   Required variables:');
  console.error('   - SLACK_ACCESS_TOKEN');
  console.error('   - SLACK_REFRESH_TOKEN');
  console.error('   - SLACK_CLIENT_ID');
  console.error('   - SLACK_CLIENT_SECRET');
  console.error('   - SLACK_CHANNEL_ID');
  console.error('   - SLACK_NOTIFICATIONS_ENABLED=true\n');
  process.exit(1);
}

console.log('✅ Slack configuration looks good!\n');

// Test 1: Simple message
console.log('📤 Test 1: Sending simple test message...');
try {
  const result = await slackService.sendMessage(
    '🧪 Test notification from Flowerpil development environment',
    null
  );

  if (result) {
    console.log('✅ Test 1 passed! Simple message sent successfully.');
    console.log('   Message timestamp:', result.ts);
  } else {
    console.log('⚠️  Test 1: Message not sent (notifications may be disabled)');
  }
} catch (error) {
  console.error('❌ Test 1 failed:', error.message);
  if (error.slackError) {
    console.error('   Slack error code:', error.slackError);
  }
  if (error.response?.data) {
    console.error('   Full Slack response:', JSON.stringify(error.response.data, null, 2));
  }

  // Don't exit on missing_scope - show helpful message
  if (error.slackError === 'missing_scope') {
    console.error('');
    console.error('⚠️  Your Slack app needs additional permissions!');
    console.error('   Required scopes: chat:write, channels:read, groups:write');
    console.error('');
    console.error('   To fix:');
    console.error('   1. Go to https://api.slack.com/apps/A09NBHDCFHV');
    console.error('   2. Click "OAuth & Permissions"');
    console.error('   3. Ensure these scopes are added under "Bot Token Scopes":');
    console.error('      - chat:write');
    console.error('      - chat:write.public (for public channels)');
    console.error('      - channels:read');
    console.error('      - groups:write (for private channels)');
    console.error('   4. Click "Reinstall App" at the top');
    console.error('   5. Update your access token in ecosystem.config.cjs');
    console.error('');
  }
  process.exit(1);
}

console.log('');

// Test 2: Rich Apple Music export notification
console.log('📤 Test 2: Sending rich Apple Music export notification...');
try {
  const result = await slackService.notifyAppleExportSuccess({
    playlistId: 999,
    playlistTitle: 'Test Playlist - Summer Vibes 2025',
    curatorName: 'Test Curator (Dev)',
    appleLibraryId: 'p.ABC123TEST',
    storefront: 'us'
  });

  if (result) {
    console.log('✅ Test 2 passed! Rich notification sent successfully.');
    console.log('   Message timestamp:', result.ts);
  } else {
    console.log('⚠️  Test 2: Message not sent (notifications may be disabled)');
  }
} catch (error) {
  console.error('❌ Test 2 failed:', error.message);
  if (error.slackError) {
    console.error('   Slack error:', error.slackError);
  }
  process.exit(1);
}

console.log('');

// Test 3: Resolution failure notification
console.log('📤 Test 3: Sending resolution failure notification...');
try {
  const result = await slackService.notifyAppleResolutionFailed({
    playlistId: 999,
    playlistTitle: 'Test Playlist - Failed Resolution',
    attempts: 60,
    error: 'Exceeded maximum attempts without finding share URL (test scenario)'
  });

  if (result) {
    console.log('✅ Test 3 passed! Failure notification sent successfully.');
    console.log('   Message timestamp:', result.ts);
  } else {
    console.log('⚠️  Test 3: Message not sent (notifications may be disabled)');
  }
} catch (error) {
  console.error('❌ Test 3 failed:', error.message);
  if (error.slackError) {
    console.error('   Slack error:', error.slackError);
  }
  process.exit(1);
}

console.log('');
console.log('🎉 All tests completed successfully!');
console.log('');
console.log('📱 Check your Slack channel (#export-alerts) to verify messages arrived.');
console.log('');
console.log('💡 Tips:');
console.log('   - If messages didn\'t arrive, check the channel ID is correct');
console.log('   - Ensure the Slack app has been added to the #export-alerts channel');
console.log('   - Verify the app has chat:write permission');
console.log('   - Check PM2 logs for any errors: pm2 logs');
console.log('');

process.exit(0);
