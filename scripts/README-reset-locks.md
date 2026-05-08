# Reset Account Locks Utility

A utility script to manage and reset account locks that occur after multiple failed login attempts.

## Quick Start

```bash
# List all locked accounts
npm run locks:list

# Unlock all locked accounts
npm run locks:reset

# Unlock specific account
npm run locks:reset curator@flowerpil.io

# Clean up expired locks only
npm run locks:clean
```

## Usage Details

### 1. List Locked Accounts
View all accounts that have locks (active or expired):

```bash
npm run locks:list
```

Output example:
```
╔═══════════════════════════════════════════════════════════════╗
║                    Locked Accounts                            ║
╚═══════════════════════════════════════════════════════════════╝

1. curator@test.com
   Status: 🔒 LOCKED
   Failed Attempts: 5
   Locked Until: 2025-10-31T12:30:00.000Z
   Time Remaining: 15 minute(s)

Total: 1 (1 active, 0 expired)
```

### 2. Unlock All Accounts
Removes all locks and resets failed login attempts:

```bash
npm run locks:reset
```

### 3. Unlock Specific Account
Unlock a single account by email/username:

```bash
npm run locks:reset curator@flowerpil.io
```

### 4. Clean Expired Locks Only
Removes locks that have already expired (keeps active locks):

```bash
npm run locks:clean
```

## When to Use

### Development & Testing
- After running authentication tests that intentionally lock accounts
- When testing the lock behavior itself
- To quickly reset test accounts

### Production (with caution)
- Unlock legitimate users who were locked by mistake
- Bulk unlock after resolving a system issue that caused false lockouts
- Clean up old expired locks from the database

## What It Does

The script performs the following actions:

1. **Updates `admin_users` table**: Sets `locked_until = NULL` and `failed_login_attempts = 0`
2. **Clears `account_lockouts` table**: Removes corresponding lockout records
3. **Logs security event**: Records the unlock action in security logs
4. **Provides feedback**: Shows which accounts were unlocked and their previous status

## Security Logging

All unlock actions are logged as security events:

```javascript
{
  event: 'ACCOUNT_UNLOCKED',
  username: 'curator@test.com',
  unlockedBy: 'admin_script',
  wasActiveLock: true,
  previousLockUntil: '2025-10-31T12:30:00.000Z'
}
```

## Production Considerations

⚠️ **Use carefully in production:**

- Unlocking accounts bypasses the security lockout mechanism
- Consider whether the lock was legitimate before unlocking
- Review failed login attempts logs to identify potential attacks
- Use specific email unlock rather than bulk unlock when possible
- Keep audit trail of who ran the script and why

## Troubleshooting

### "No locked accounts found"
This means all accounts are currently unlocked or all locks have expired.

### "Account not found"
The email/username provided doesn't exist in the database.

### "Account is not locked"
The specified account exists but doesn't have an active or expired lock.

## Technical Details

### Lock Mechanism
Accounts are locked after 5 failed login attempts with exponential backoff:
- 5-7 attempts: 1 minute
- 8-10 attempts: 5 minutes
- 11-15 attempts: 15 minutes
- 16-20 attempts: 30 minutes
- 21-30 attempts: 60 minutes
- 31+ attempts: 240 minutes (4 hours)

### Database Tables Affected
- `admin_users.locked_until` - Primary lock timestamp
- `admin_users.failed_login_attempts` - Attempt counter
- `account_lockouts` - Audit trail of locks

## See Also

- Account locking bug fix: `server/utils/securityLogger.js` (line 215-223)
- Authentication tests: `server/api/__tests__/auth.login-errors.test.js`
- Lock checking logic: `server/utils/authUtils.js` (`isAccountLocked`)
