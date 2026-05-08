#!/usr/bin/env node

/**
 * Error Reporting System Test Script
 * 
 * Tests the error reporting system by triggering various error types
 * that should be captured, classified, and optionally alerted via Slack.
 * 
 * Usage:
 *   node server/dev/test-error-reporting.js [error-type]
 * 
 * Error types:
 *   - uncaught-exception: Triggers an uncaught exception
 *   - unhandled-rejection: Triggers an unhandled promise rejection
 *   - stale-lock: Simulates a stale import lock error
 *   - token-expired: Simulates a token expiration error
 *   - stalled-export: Simulates a stalled export error
 *   - worker-timeout: Simulates a worker timeout error
 *   - database-error: Simulates a database error
 *   - all: Runs all error types sequentially
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

// Import error handler first (must be before other imports)
import '../utils/pm2ErrorHandler.js';

// Import error report service
import { errorReportService } from '../services/errorReportService.js';

const ERROR_TYPES = {
  'uncaught-exception': () => {
    console.log('🧪 Testing: Uncaught Exception');
    throw new Error('Test uncaught exception - this should be caught by pm2ErrorHandler');
  },
  
  'unhandled-rejection': () => {
    console.log('🧪 Testing: Unhandled Promise Rejection');
    Promise.reject(new Error('Test unhandled rejection - this should be caught by pm2ErrorHandler'));
  },
  
  'stale-lock': async () => {
    console.log('🧪 Testing: Stale Import Lock Error');
    const error = new Error('Import lock acquired but process timed out');
    await errorReportService.captureError({
      type: 'WORKER_FAILURE',
      error,
      severity: 'HIGH',
      context: { workerName: 'test-import-worker', playlistId: 123 }
    });
    console.log('✅ Error captured (should be classified as STALE_IMPORT_LOCK)');
  },
  
  'token-expired': async () => {
    console.log('🧪 Testing: Token Expired Error');
    const error = new Error('Spotify API returned 401: Token expired');
    await errorReportService.captureError({
      type: 'API_ERROR',
      error,
      severity: 'HIGH',
      context: { platform: 'spotify', endpoint: '/v1/me' }
    });
    console.log('✅ Error captured (should be classified as TOKEN_EXPIRED)');
  },
  
  'stalled-export': async () => {
    console.log('🧪 Testing: Stalled Export Error');
    const error = new Error('Export stuck in processing state for over 30 minutes');
    await errorReportService.captureError({
      type: 'WORKER_FAILURE',
      error,
      severity: 'MEDIUM',
      context: { workerName: 'dsp-export-worker', exportId: 456 }
    });
    console.log('✅ Error captured (should be classified as STALLED_EXPORT)');
  },
  
  'worker-timeout': async () => {
    console.log('🧪 Testing: Worker Timeout Error');
    const error = new Error('Worker did not respond within timeout period');
    await errorReportService.captureError({
      type: 'WORKER_FAILURE',
      error,
      severity: 'HIGH',
      context: { workerName: 'linking-worker', timeout: 30000 }
    });
    console.log('✅ Error captured (should be classified as WORKER_TIMEOUT)');
  },
  
  'database-error': async () => {
    console.log('🧪 Testing: Database Error');
    const error = new Error('SQLITE_BUSY: database is locked');
    await errorReportService.captureError({
      type: 'DATABASE_ERROR',
      error,
      severity: 'CRITICAL',
      context: { query: 'SELECT * FROM playlists', table: 'playlists' }
    });
    console.log('✅ Error captured (should be classified as DATABASE_ERROR)');
  },
  
  'unknown-error': async () => {
    console.log('🧪 Testing: Unknown Error Type');
    const error = new Error('Some random error that does not match any pattern');
    await errorReportService.captureError({
      type: 'UNKNOWN_ERROR',
      error,
      severity: 'LOW',
      context: { random: 'data' }
    });
    console.log('✅ Error captured (should be classified as UNKNOWN)');
  }
};

async function runTest(errorType) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`🧪 Error Reporting Test: ${errorType}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const testFn = ERROR_TYPES[errorType];
  
  if (!testFn) {
    console.error(`❌ Unknown error type: ${errorType}`);
    console.log('\nAvailable error types:');
    Object.keys(ERROR_TYPES).forEach(type => {
      console.log(`  - ${type}`);
    });
    process.exit(1);
  }

  try {
    if (testFn.constructor.name === 'AsyncFunction') {
      await testFn();
    } else {
      testFn();
    }
    
    // For uncaught exceptions and unhandled rejections, give time for handler
    if (errorType === 'uncaught-exception' || errorType === 'unhandled-rejection') {
      console.log('⏳ Waiting 2 seconds for error handler to process...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n✅ Test completed');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function runAllTests() {
  console.log('\n🧪 Running all error type tests...\n');
  
  const types = Object.keys(ERROR_TYPES).filter(t => t !== 'all');
  
  for (const type of types) {
    await runTest(type);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('✅ All tests completed!');
  console.log('\n📊 Check the admin dashboard at /admin?tab=admin&subtab=errors');
  console.log('📧 Check Slack for HIGH/CRITICAL severity alerts\n');
}

// Main execution
const errorType = process.argv[2] || 'stale-lock';

if (errorType === 'all') {
  runAllTests().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
} else {
  runTest(errorType).then(() => {
    console.log('📊 Check the admin dashboard at /admin?tab=admin&subtab=errors');
    console.log('📧 Check Slack for HIGH/CRITICAL severity alerts\n');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}







