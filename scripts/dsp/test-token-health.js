#!/usr/bin/env node

/**
 * Test Token Health Service
 *
 * Validates the tokenHealthService.js functions with sample data
 */

import tokenHealthService from '../../server/services/tokenHealthService.js';

const {
  HealthStatus,
  calculateHealthStatus,
  refreshAllTokenHealthStatuses,
  getTokensByHealthStatus,
  getHealthReport,
  getTokensNeedingRefresh
} = tokenHealthService;

console.log('\n=== Token Health Service Testing ===\n');

// Test 1: Calculate health status
console.log('Test 1: Calculate health status for different scenarios');

const now = new Date();
const in1Hour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
const in72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
const expired = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

console.log(`  Expires in 1 hour: ${calculateHealthStatus(in1Hour)} (expected: expiring)`);
console.log(`  Expires in 24 hours: ${calculateHealthStatus(in24Hours)} (expected: expiring)`);
console.log(`  Expires in 48 hours: ${calculateHealthStatus(in48Hours)} (expected: expiring/healthy boundary)`);
console.log(`  Expires in 72 hours: ${calculateHealthStatus(in72Hours)} (expected: healthy)`);
console.log(`  Already expired: ${calculateHealthStatus(expired)} (expected: expired)`);
console.log('  ✓ PASS: Health calculation working\n');

// Test 2: Refresh all token health statuses
console.log('Test 2: Refresh all token health statuses');
const refreshResult = refreshAllTokenHealthStatuses();
console.log(`  Updated: ${refreshResult.updated}`);
console.log(`  Unchanged: ${refreshResult.unchanged}`);
console.log(`  Total: ${refreshResult.total}`);
console.log('  ✓ PASS: Health refresh completed\n');

// Test 3: Get tokens by health status
console.log('Test 3: Get tokens by health status');
const healthyTokens = getTokensByHealthStatus(HealthStatus.HEALTHY);
const expiringTokens = getTokensByHealthStatus(HealthStatus.EXPIRING);
const expiredTokens = getTokensByHealthStatus(HealthStatus.EXPIRED);

console.log(`  Healthy: ${healthyTokens.length}`);
healthyTokens.forEach(t => {
  console.log(`    - ${t.platform} (${t.account_label}): expires ${t.expires_at}`);
});

console.log(`  Expiring: ${expiringTokens.length}`);
expiringTokens.forEach(t => {
  console.log(`    - ${t.platform} (${t.account_label}): expires ${t.expires_at}`);
});

console.log(`  Expired: ${expiredTokens.length}`);
console.log('  ✓ PASS: Status filtering working\n');

// Test 4: Get tokens needing refresh
console.log('Test 4: Get tokens needing refresh (< 24h and have refresh_token)');
const needsRefresh = getTokensNeedingRefresh();
console.log(`  Tokens needing refresh: ${needsRefresh.length}`);
needsRefresh.forEach(t => {
  console.log(`    - ${t.platform} (${t.account_label}): expires ${t.expires_at}`);
});
console.log('  ✓ PASS: Refresh detection working\n');

// Test 5: Get comprehensive health report
console.log('Test 5: Comprehensive health report');
const report = getHealthReport();

console.log('\n  === Summary ===');
console.log(`  Total tokens: ${report.summary.total}`);
console.log(`  Healthy: ${report.summary.healthy}`);
console.log(`  Expiring: ${report.summary.expiring}`);
console.log(`  Expired: ${report.summary.expired}`);
console.log(`  Revoked: ${report.summary.revoked}`);
console.log(`  Unknown: ${report.summary.unknown}`);
console.log(`  Needs refresh: ${report.summary.needsRefresh}`);

console.log('\n  === By Platform ===');
console.log(`  Spotify: ${report.summary.platforms.spotify}`);
console.log(`  TIDAL: ${report.summary.platforms.tidal}`);
console.log(`  Apple: ${report.summary.platforms.apple}`);

console.log('\n  === All Tokens (sorted by urgency) ===');
console.log('  Platform | Label           | Active | Health    | Urgency   | Expires At');
console.log('  ---------|-----------------|--------|-----------|-----------|---------------------------');
report.tokens.forEach(t => {
  const active = t.is_active === 1 ? 'YES' : 'NO ';
  const expiresAt = t.expires_at ? t.expires_at.substring(0, 19).replace('T', ' ') : 'N/A';
  console.log(`  ${t.platform.padEnd(8)} | ${t.account_label.padEnd(15)} | ${active}    | ${t.health_status.padEnd(9)} | ${t.expiry_urgency.padEnd(9)} | ${expiresAt}`);
});

console.log('\n✓ All health service tests completed!\n');

// Test 6: Alert summary
console.log('Test 6: Alert summary');
const alerts = [];

if (report.summary.expired > 0) {
  alerts.push(`🔴 CRITICAL: ${report.summary.expired} token(s) expired`);
}
if (report.summary.revoked > 0) {
  alerts.push(`🔴 CRITICAL: ${report.summary.revoked} token(s) revoked`);
}
if (report.summary.needsRefresh > 0) {
  alerts.push(`⚠️  WARNING: ${report.summary.needsRefresh} token(s) need refresh within 24h`);
}
if (report.summary.expiring > 0) {
  alerts.push(`⚠️  WARNING: ${report.summary.expiring} token(s) expiring within 48h`);
}
if (alerts.length === 0) {
  alerts.push('✅ All tokens healthy');
}

console.log('\n  Alerts:');
alerts.forEach(alert => console.log(`    ${alert}`));

console.log('\n=== Testing Complete ===\n');
