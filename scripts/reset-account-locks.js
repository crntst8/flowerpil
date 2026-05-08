#!/usr/bin/env node

/**
 * Reset Account Locks Utility
 *
 * Unlocks user accounts that have been locked due to failed login attempts.
 *
 * Usage:
 *   node scripts/reset-account-locks.js                    # Unlock all locked accounts
 *   node scripts/reset-account-locks.js user@email.com     # Unlock specific account
 *   node scripts/reset-account-locks.js --list             # Show all locked accounts
 *   node scripts/reset-account-locks.js --expired          # Clean up expired locks only
 */

import { getDatabase } from '../server/database/db.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../server/utils/securityLogger.js';

const args = process.argv.slice(2);
const targetEmail = args[0];

function showUsage() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Account Lock Reset Utility                          ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  node scripts/reset-account-locks.js                 Unlock all locked accounts
  node scripts/reset-account-locks.js user@email.com  Unlock specific account
  node scripts/reset-account-locks.js --list          Show all locked accounts
  node scripts/reset-account-locks.js --expired       Clean up expired locks only
  node scripts/reset-account-locks.js --help          Show this help

Examples:
  node scripts/reset-account-locks.js curator@flowerpil.io
  node scripts/reset-account-locks.js --list
  `);
}

/**
 * Get all currently locked accounts
 */
function getLockedAccounts(db) {
  const query = db.prepare(`
    SELECT
      au.id,
      au.username,
      au.locked_until,
      au.failed_login_attempts,
      CASE
        WHEN au.locked_until > datetime('now') THEN 'ACTIVE'
        ELSE 'EXPIRED'
      END as lock_status
    FROM admin_users au
    WHERE au.locked_until IS NOT NULL
    ORDER BY au.locked_until DESC
  `);

  return query.all();
}

/**
 * Display locked accounts in a formatted table
 */
function displayLockedAccounts(accounts) {
  if (accounts.length === 0) {
    console.log('✅ No locked accounts found.');
    return;
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    Locked Accounts                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  accounts.forEach((account, index) => {
    const lockedUntil = new Date(account.locked_until);
    const now = new Date();
    const isActive = lockedUntil > now;
    const timeRemaining = isActive
      ? Math.ceil((lockedUntil - now) / (1000 * 60))
      : 0;

    console.log(`${index + 1}. ${account.username}`);
    console.log(`   Status: ${isActive ? '🔒 LOCKED' : '⏰ EXPIRED'}`);
    console.log(`   Failed Attempts: ${account.failed_login_attempts}`);
    console.log(`   Locked Until: ${lockedUntil.toISOString()}`);
    if (isActive) {
      console.log(`   Time Remaining: ${timeRemaining} minute(s)`);
    }
    console.log('');
  });

  const activeLocks = accounts.filter(a => a.lock_status === 'ACTIVE').length;
  const expiredLocks = accounts.filter(a => a.lock_status === 'EXPIRED').length;

  console.log(`Total: ${accounts.length} (${activeLocks} active, ${expiredLocks} expired)`);
}

/**
 * Unlock a specific account
 */
async function unlockAccount(db, username) {
  // Check if account exists and is locked
  const user = db.prepare(`
    SELECT id, username, locked_until, failed_login_attempts
    FROM admin_users
    WHERE username = ?
  `).get(username);

  if (!user) {
    console.error(`❌ Error: Account not found: ${username}`);
    return false;
  }

  if (!user.locked_until) {
    console.log(`ℹ️  Account ${username} is not locked.`);
    return false;
  }

  const lockedUntil = new Date(user.locked_until);
  const isActive = lockedUntil > new Date();

  // Unlock the account
  db.prepare(`
    UPDATE admin_users
    SET locked_until = NULL,
        failed_login_attempts = 0
    WHERE username = ?
  `).run(username);

  // Also clear from account_lockouts table
  db.prepare(`
    DELETE FROM account_lockouts
    WHERE username = ?
  `).run(username);

  // Log the unlock event
  await logSecurityEvent(SECURITY_EVENTS.ACCOUNT_UNLOCKED, {
    username,
    userId: user.id,
    details: {
      wasActiveLock: isActive,
      previousLockUntil: user.locked_until,
      previousFailedAttempts: user.failed_login_attempts,
      unlockedBy: 'admin_script'
    }
  });

  console.log(`✅ Successfully unlocked: ${username}`);
  if (isActive) {
    const minutesRemaining = Math.ceil((lockedUntil - new Date()) / (1000 * 60));
    console.log(`   (Was locked for ${minutesRemaining} more minute(s))`);
  } else {
    console.log(`   (Lock had already expired)`);
  }

  return true;
}

/**
 * Unlock all locked accounts
 */
async function unlockAllAccounts(db) {
  const accounts = getLockedAccounts(db);

  if (accounts.length === 0) {
    console.log('✅ No locked accounts found.');
    return 0;
  }

  console.log(`\nFound ${accounts.length} locked account(s). Unlocking...`);

  let unlockedCount = 0;
  for (const account of accounts) {
    const success = await unlockAccount(db, account.username);
    if (success) {
      unlockedCount++;
    }
  }

  console.log(`\n✅ Unlocked ${unlockedCount} account(s).`);
  return unlockedCount;
}

/**
 * Clean up expired locks only
 */
function cleanupExpiredLocks(db) {
  // Clean up admin_users
  const result1 = db.prepare(`
    UPDATE admin_users
    SET locked_until = NULL,
        failed_login_attempts = 0
    WHERE locked_until IS NOT NULL
      AND locked_until <= datetime('now')
  `).run();

  // Clean up account_lockouts table
  const result2 = db.prepare(`
    DELETE FROM account_lockouts
    WHERE locked_until <= datetime('now')
  `).run();

  const totalCleaned = result1.changes + result2.changes;

  if (totalCleaned > 0) {
    console.log(`✅ Cleaned up ${totalCleaned} expired lock(s).`);
  } else {
    console.log('ℹ️  No expired locks found.');
  }

  return totalCleaned;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Show help
    if (args.includes('--help') || args.includes('-h')) {
      showUsage();
      process.exit(0);
    }

    const db = getDatabase();

    // List locked accounts
    if (args.includes('--list') || args.includes('-l')) {
      const accounts = getLockedAccounts(db);
      displayLockedAccounts(accounts);
      process.exit(0);
    }

    // Clean up expired locks only
    if (args.includes('--expired') || args.includes('-e')) {
      cleanupExpiredLocks(db);
      process.exit(0);
    }

    // Unlock specific account
    if (targetEmail && !targetEmail.startsWith('--')) {
      await unlockAccount(db, targetEmail);
      process.exit(0);
    }

    // Unlock all accounts (default behavior with no args)
    await unlockAllAccounts(db);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
