# Email System

## Purpose

Provides transactional email delivery for authentication, password recovery, and curator referrals using Brevo SMTP relay with secure verification code handling and comprehensive audit logging.

## How It Works

The emailService module (`server/utils/emailService.js`) wraps nodemailer targeting Brevo's SMTP relay. The module initializes a transporter lazily on first send with configuration from environment variables (BREVO_HOST, BREVO_PORT, BREVO_USER, BREVO_PASS). shouldMockEmails() centralizes mock-mode checks (MOCK_EMAIL flag or NODE_ENV==='test'), skipping actual SMTP in test/dev environments and logging summaries instead.

Verification codes use generateVerificationCode() for random 6-digit strings, then hashCode() applies HMAC with EMAIL_CODE_PEPPER secret before database storage. verifyCodeHash() performs timing-safe comparison via crypto.timingSafeEqual to prevent timing attacks. Password reset tokens use SHA-256 hashes stored in password_reset_tokens table with expiration tracking.

resolveSender() allows per-template from-address overrides via EMAIL_FROM_<PURPOSE> environment variables (signup, passwordReset, referral). Each email type has dedicated helper functions that construct plaintext templates and invoke sendPlaintextEmail() with appropriate headers.

Security event logging via logSecurityEvent() (`server/utils/securityLogger.js`) tracks all email operations to security_events table with event types PASSWORD_RESET_REQUEST, SECURITY_EVENTS.ADMIN_ACTION, user context, IP addresses, and user agent strings.

## API/Interface

### Email Service Functions

**sendPasswordResetEmail:**
```javascript
sendPasswordResetEmail({ email, resetLink, expiresMinutes })
// Sends password reset instructions with expiration notice
```

**sendSignupConfirmationEmail:**
```javascript
sendSignupConfirmationEmail({ email, confirmationCode, accountType })
// Sends verification code for signup or welcome message for curator accounts
// accountType: 'account' (includes code) or 'curator' (welcome only)
```

**sendReferralSubmissionEmail:**
```javascript
sendReferralSubmissionEmail({ email, referralCode, inviteeName, issuerName })
// Notifies invitee about curator referral with code instructions
```

**generateVerificationCode:**
```javascript
generateVerificationCode()
// Returns: string (6-digit random number)
```

**hashCode / verifyCodeHash:**
```javascript
hashCode(code)
// Returns: string (HMAC-SHA256 hash using EMAIL_CODE_PEPPER)

verifyCodeHash(code, hash)
// Returns: boolean (timing-safe comparison result)
```

**verifyEmailConnection:**
```javascript
verifyEmailConnection()
// Returns: Promise<void>
// Calls transporter.verify() for readiness checks
// No-op in mock mode
```

### Authentication Endpoints

**POST /api/v1/auth/signup** (`server/api/auth.js`:1222)

User signup with email verification.

**Process:**
1. Validates email and password
2. Generates 6-digit code via generateVerificationCode()
3. Hashes with hashCode() and stores in email_codes table
4. Calls sendSignupConfirmationEmail() with confirmationCode
5. On send failure, rolls back user record and returns error

**POST /api/v1/auth/verify**

Verifies email code and issues JWT.

**POST /api/v1/auth/password/reset-request** (`server/api/auth.js`:483)

Initiates password reset flow for admins and users.

**Process:**
1. Searches admin_users and users tables for email match
2. Purges expired tokens via purgeExpiredPasswordResetTokens()
3. Creates SHA-256 token hash with expiration
4. Builds reset link using PASSWORD_RESET_LINK_BASE
5. Calls sendPasswordResetEmail()
6. On failure, invalidates fresh token

**POST /api/v1/auth/password/reset**

Validates token and updates password.

### Referral Endpoints

**POST /api/v1/admin/referrals/issue** (`server/api/admin/referrals.js`:41)

Admin-issued referral codes (Base64 variant).

**POST /api/v1/curator/referrals** (`server/api/curator/index.js`:452)

Curator self-service referrals (shorter alphanumeric codes).

Both wrap sendReferralSubmissionEmail() in try/catch and mark emailSent in response.

### Admin Test Endpoint

**POST /api/v1/admin/site-admin/test-email** (`server/api/admin/siteAdmin.js`:143)

Administrative email testing harness.

**Request:**
```json
{
  "purpose": "signup",
  "emailOverride": "test@example.com"
}
```

**Supported purposes:**
- signup
- password_reset
- referral

**Process:**
1. Validates purpose enum
2. Resolves recipient to emailOverride or admin's email
3. Synthesizes template data (fresh verification code, fake reset link, referral sample)
4. Calls corresponding send helper
5. Logs via SECURITY_EVENTS.ADMIN_ACTION with mockMode flag
6. Returns JSON with recipient, messageId, scenario-specific snippets

**Response:**
```json
{
  "success": true,
  "recipient": "admin@example.com",
  "messageId": "<abc123@brevo.com>",
  "mockMode": false,
  "verificationCode": "123456"
}
```

## Database

### email_codes Table

From `server/database/db.js`:473:

```sql
CREATE TABLE email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('signup', 'verify_email', 'login', 'reset_password')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invalidated_at DATETIME
)
```

**Queries from server/database/db.js:~1591:**

createEmailCode:
```sql
INSERT INTO email_codes (user_id, code_hash, purpose, expires_at)
VALUES (?, ?, ?, datetime('now', '+10 minutes'))
```

getActiveCode:
```sql
SELECT * FROM email_codes
WHERE user_id = ? AND purpose = ? AND invalidated_at IS NULL
  AND expires_at > datetime('now')
ORDER BY created_at DESC LIMIT 1
```

incrementCodeAttempt:
```sql
UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?
```

invalidateCodes:
```sql
UPDATE email_codes SET invalidated_at = CURRENT_TIMESTAMP
WHERE user_id = ? AND purpose = ?
```

### password_reset_tokens Table

```sql
CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('admin', 'user')),
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used BOOLEAN DEFAULT 0
)
```

Stores SHA-256 hashes of reset tokens with user_type distinguishing admin_users vs users table.

**Queries:**

createPasswordResetToken, invalidatePasswordResetTokensForUser, purgeExpiredPasswordResetTokens manage lifecycle.

### security_events Table

Audit trail for all email operations:

```sql
CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  endpoint TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Event types include PASSWORD_RESET_REQUEST, PASSWORD_RESET_SUCCESS, ADMIN_ACTION.

## Integration Points

### Internal Dependencies

- **nodemailer** - SMTP transport
- **crypto** (Node.js built-in) - HMAC for code hashing, SHA-256 for reset tokens
- **securityLogger** (`server/utils/securityLogger.js`) - Audit logging via logSecurityEvent()
- **authUtils** (`server/utils/authUtils.js`) - Password hashing and validation

### External Dependencies

- **Brevo SMTP Relay** - smtp-relay.brevo.com:587 with STARTTLS

### API Integration

Called from:
- `server/api/auth.js` - Signup, verification, password reset
- `server/api/curator/index.js` - Curator referrals
- `server/api/admin/referrals.js` - Admin referral operations
- `server/api/admin/siteAdmin.js` - Test email endpoint

### Frontend Integration

Test UI in `src/modules/admin/components/SiteAdmin.jsx`:2260 provides one-click test buttons with optional email override input, rendering success/error banners from endpoint response.

## Configuration

### Required Environment Variables

**BREVO_USER**
- SMTP authentication username (Brevo account email)
- No default

**BREVO_PASS**
- SMTP authentication password (Brevo SMTP key)
- No default

**EMAIL_CODE_PEPPER**
- HMAC secret for verification code hashing
- Generated via `node server/dev/setupEnv.js` if missing
- Format: 64-character hex string

### Optional Environment Variables

**BREVO_HOST**
- SMTP server hostname
- Default: smtp-relay.brevo.com

**BREVO_PORT**
- SMTP server port
- Default: 587
- Parsed as integer

**PASSWORD_RESET_EXP_MINUTES**
- Reset token expiration in minutes
- Default: 60

**PASSWORD_RESET_LINK_BASE**
- Base URL for reset links
- Default: https://flowerpil.io/reset-password
- Format: `{BASE}?token={token}`

**MOCK_EMAIL**
- Forces mock mode when set to "true"
- Auto-enabled in test environments unless explicitly "false"

**Per-Template From Overrides:**
- EMAIL_FROM_SIGNUP - Signup email sender address
- EMAIL_FROM_SIGNUP_NAME - Signup sender display name
- EMAIL_FROM_PASSWORDRESET - Password reset sender
- EMAIL_FROM_PASSWORDRESET_NAME - Password reset sender name
- EMAIL_FROM_REFERRAL - Referral email sender
- EMAIL_FROM_REFERRAL_NAME - Referral sender name

Falls back to hard-coded defaults in emailService when not set.

### Setup Helper

```bash
node server/dev/setupEnv.js
```

Prints ready-to-copy .env template with guidance for Brevo credentials.

## Usage Examples

### Sending Password Reset Email

From `server/api/auth.js`:

```javascript
import { sendPasswordResetEmail } from '../utils/emailService.js';

const resetLink = `${process.env.PASSWORD_RESET_LINK_BASE}?token=${rawToken}`;
const expiresMinutes = parseInt(process.env.PASSWORD_RESET_EXP_MINUTES) || 60;

try {
  await sendPasswordResetEmail({
    email: user.email,
    resetLink,
    expiresMinutes
  });
} catch (error) {
  console.error('Failed to send reset email:', error);
  // Invalidate token on send failure
  await invalidatePasswordResetTokensForUser(user.id, userType);
  throw new Error('Failed to send reset email');
}
```

### Sending Signup Verification

From `server/api/auth.js`:1222:

```javascript
import { generateVerificationCode, hashCode, sendSignupConfirmationEmail } from '../utils/emailService.js';

const verificationCode = generateVerificationCode();
const codeHash = hashCode(verificationCode);

// Store in database
await createEmailCode({
  userId: null,
  codeHash,
  purpose: 'signup',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
});

// Send email
try {
  await sendSignupConfirmationEmail({
    email,
    confirmationCode: verificationCode,
    accountType: 'account'
  });
} catch (error) {
  // Rollback user creation on email failure
  await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  throw error;
}
```

### Verifying Email Code

From `server/database/db.js`:

```javascript
import { verifyCodeHash } from '../utils/emailService.js';

const activeCode = await getActiveCode(userId, 'signup');

if (!activeCode) {
  throw new Error('No active verification code');
}

if (activeCode.attempts >= activeCode.max_attempts) {
  throw new Error('Too many verification attempts');
}

const isValid = verifyCodeHash(submittedCode, activeCode.code_hash);

if (!isValid) {
  await incrementCodeAttempt(activeCode.id);
  throw new Error('Invalid verification code');
}

// Success - invalidate code
await invalidateCodes(userId, 'signup');
```

### Testing Email Configuration

From `server/api/admin/siteAdmin.js`:143:

```javascript
router.post('/test-email', authMiddleware, requireAdmin, async (req, res) => {
  const { purpose, emailOverride } = req.body;

  if (!['signup', 'password_reset', 'referral'].includes(purpose)) {
    return res.status(400).json({ error: 'Invalid purpose' });
  }

  const recipient = emailOverride || req.user.username;
  let result;

  try {
    if (purpose === 'signup') {
      const code = generateVerificationCode();
      result = await sendSignupConfirmationEmail({
        email: recipient,
        confirmationCode: code,
        accountType: 'account'
      });
      result.verificationCode = code;
    } else if (purpose === 'password_reset') {
      result = await sendPasswordResetEmail({
        email: recipient,
        resetLink: 'https://flowerpil.io/reset-password?token=TEST_TOKEN_123',
        expiresMinutes: 60
      });
    } else if (purpose === 'referral') {
      result = await sendReferralSubmissionEmail({
        email: recipient,
        referralCode: 'TEST123',
        inviteeName: 'Test User',
        issuerName: req.user.username
      });
    }

    logSecurityEvent({
      eventType: 'ADMIN_ACTION',
      userId: req.user.id,
      ipAddress: req.ip,
      endpoint: '/api/v1/admin/site-admin/test-email',
      details: { purpose, recipient, mockMode: shouldMockEmails() }
    });

    res.json({ success: true, recipient, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Sending Referral Email

From `server/api/admin/referrals.js`:41:

```javascript
import { sendReferralSubmissionEmail } from '../../utils/emailService.js';

let emailSent = false;

try {
  await sendReferralSubmissionEmail({
    email: inviteeEmail,
    referralCode,
    inviteeName,
    issuerName: req.user.username
  });
  emailSent = true;
} catch (error) {
  console.warn('Failed to send referral email:', error);
  // Continue despite email failure
}

res.json({
  success: true,
  referralCode,
  emailSent
});
```

### Mock Mode Detection

From `server/utils/emailService.js`:

```javascript
function shouldMockEmails() {
  if (process.env.MOCK_EMAIL === 'true') return true;
  if (process.env.NODE_ENV === 'test') return true;
  return false;
}

async function sendPlaintextEmail({ to, from, subject, text }) {
  if (shouldMockEmails()) {
    console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
    console.log(`[MOCK EMAIL] Body: ${text}`);
    return { messageId: 'mock-' + Date.now(), mockMode: true };
  }

  const info = await transporter.sendMail({ to, from, subject, text });
  return { messageId: info.messageId, mockMode: false };
}
```

### Readiness Check

```javascript
import { verifyEmailConnection } from '../utils/emailService.js';

async function healthCheck() {
  try {
    await verifyEmailConnection();
    console.log('Email service ready');
  } catch (error) {
    console.error('Email service not ready:', error);
    process.exit(1);
  }
}
```
