# Signup System

## Purpose

Provides curator account signup flows with email verification, referral code validation, and conditional security verification for suspicious traffic during open signup mode.

## How It Works

The signup system supports multiple account creation paths:

1. **Curator Signup (Referral)** - Requires a valid referral code matching the user's email. Default mode when open signup is disabled.
2. **Curator Signup (Open)** - No referral required when `open_signup_enabled` is true. Suspicious traffic triggers email verification.

### Open Signup Hardening

When open signup is enabled, the system evaluates traffic risk signals to conditionally require email verification:

**Risk Signals Evaluated:**
- Country outside allowlist (AU, US, GB, NZ) via `cf-ipcountry` header
- Non-common email TLD (e.g., `.xyz`, `.top`, `.ru`)
- Bot or headless user agent patterns
- Missing or suspicious headers

**Flow:**
1. User enters email on step 0
2. Client calls `POST /api/v1/auth/curator/open-signup/check`
3. Server evaluates risk flags
4. If not suspicious: proceed directly to password step
5. If suspicious: send OTC code via Brevo, show verification step
6. After OTC verification: continue normal signup wizard

## API Endpoints

### POST /api/v1/auth/curator/open-signup/check

Preflight check for open signup mode. Evaluates risk and sends verification code if needed.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (trusted traffic):**
```json
{
  "success": true,
  "requiresVerification": false,
  "riskFlags": []
}
```

**Response (suspicious traffic):**
```json
{
  "success": true,
  "requiresVerification": true,
  "riskFlags": ["country_not_allowed", "uncommon_tld"],
  "expiresAt": "2025-01-15T12:10:00.000Z"
}
```

### POST /api/v1/auth/curator/verify-email

Validates one-time code for suspicious signup verification.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (success):**
```json
{
  "success": true,
  "verified": true,
  "expiresAt": "2025-01-15T12:20:00.000Z"
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "Invalid or expired code",
  "remainingAttempts": 4
}
```

### POST /api/v1/auth/curator/signup

Creates curator account. When open signup is enabled and traffic was suspicious, requires prior email verification.

**Request:**
```json
{
  "referralCode": "ABC123",
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "curatorProfile": {
    "curatorName": "Display Name",
    "curatorType": "curator",
    "location": "Melbourne, Australia"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Curator account created successfully",
  "user": {
    "id": 123,
    "email": "user@example.com",
    "role": "curator",
    "curator_id": 456
  },
  "csrfToken": "token_here"
}
```

**Response (email verification required):**
```json
{
  "success": false,
  "error": "Email verification required",
  "type": "email_verification_required"
}
```

### POST /api/v1/auth/curator/verify-referral

Validates referral code and email match before signup (non-open mode).

**Request:**
```json
{
  "referralCode": "ABC123",
  "email": "user@example.com"
}
```

### POST /api/v1/auth/verify

Verifies email code and issues JWT.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "purpose": "signup"
}
```

## Database

### curator_email_codes Table

Stores verification codes for curator open signup (email-based, not tied to users table).

```sql
CREATE TABLE curator_email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  request_ip TEXT
);

CREATE INDEX idx_curator_email_codes_email ON curator_email_codes(email);
CREATE INDEX idx_curator_email_codes_expires ON curator_email_codes(expires_at);
```

### email_codes Table

Existing table for signup verification.

```sql
CREATE TABLE email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup','verify_email','login','reset_password')),
  attempts INTEGER DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Configuration

### Environment Variables

**OPEN_SIGNUP_ENABLED**
- Enables open curator signup without referral codes
- Set to `'true'` to enable
- Controlled via `admin_system_config` table (`open_signup_enabled`)

**ALLOWED_SIGNUP_COUNTRIES**
- Comma-separated list of allowed country codes
- Default: `AU,US,GB,NZ`
- Uses Cloudflare `cf-ipcountry` header

**ALLOWED_EMAIL_TLDS**
- Comma-separated list of trusted email TLDs
- Default: `com,net,org,edu,gov,io,co,dev,au,uk,nz,us,ca,de,fr`

### Feature Flag

The open signup mode is controlled via `admin_system_config`:

```sql
SELECT config_value FROM admin_system_config
WHERE config_key = 'open_signup_enabled';
```

Toggle via Site Admin panel or directly in database.

## Integration Points

### Internal Dependencies

- `server/utils/emailService.js` - Sends verification codes via Brevo
- `server/utils/signupRiskEvaluator.js` - Evaluates traffic risk signals
- `server/utils/securityLogger.js` - Logs security events
- `server/middleware/auth.js` - Rate limiting via `authRateLimit`
- `server/services/featureFlagService.js` - `isOpenSignupEnabled()` check

### Frontend Components

- `src/modules/curator/components/CuratorSignup.jsx` - Curator signup wizard
- Step 0: Email entry + verification (if required)
- Step 1: Password creation
- Step 2: Identity (name, type, location)
- Step 3: Pil.bio handle
- Step 4: Profile image

### External Dependencies

- **Brevo SMTP** - Email delivery for verification codes
- **Cloudflare** - Provides `cf-ipcountry` header for geo detection

## Security

### Rate Limiting

- `authRateLimit` - 15 requests/15 min per IP (production)
- Per-email resend cooldown (60 seconds between sends)
- 5 verification attempts per code before invalidation

### Verification Code Handling

- 6-digit numeric codes
- HMAC-SHA256 hashed with `EMAIL_CODE_PEPPER`
- 10-minute expiry
- Timing-safe comparison via `crypto.timingSafeEqual`

### Security Events

All signup-related events logged to `security_events` table:
- `USER_CREATION` - Successful account creation
- `SUSPICIOUS_SIGNUP` - Risk flags triggered
- `EMAIL_VERIFICATION_SENT` - OTC code dispatched
- `EMAIL_VERIFICATION_SUCCESS` - Code verified
- `EMAIL_VERIFICATION_FAILED` - Invalid code attempt

## Usage Examples

### Frontend: Open Signup Check

```javascript
const checkOpenSignup = async (email) => {
  const res = await fetch('/api/v1/auth/curator/open-signup/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();

  if (data.requiresVerification) {
    // Show verification step
    setShowVerificationStep(true);
    setCodeExpiresAt(data.expiresAt);
  } else {
    // Proceed to password step
    setStep(1);
  }
};
```

### Frontend: Verify Email Code

```javascript
const verifyEmailCode = async (email, code) => {
  const res = await fetch('/api/v1/auth/curator/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const data = await res.json();

  if (data.verified) {
    setEmailVerified(true);
    setStep(1); // Proceed to password
  } else {
    setError(data.error);
  }
};
```

### Backend: Risk Evaluation

```javascript
import { evaluateSignupRisk } from '../utils/signupRiskEvaluator.js';

const riskResult = evaluateSignupRisk({
  email: req.body.email,
  ip: req.ip,
  country: req.headers['cf-ipcountry'],
  userAgent: req.get('User-Agent')
});

if (riskResult.requiresVerification) {
  // Send verification code
  const code = generateVerificationCode();
  await sendSignupConfirmationEmail({ email, confirmationCode: code });
}
```

## Operational Notes

### Monitoring Suspicious Signups

Query recent suspicious signup attempts:

```sql
SELECT * FROM security_events
WHERE event_type = 'SUSPICIOUS_SIGNUP'
AND created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;
```

### Clearing Stale Verification Codes

Codes auto-expire after 10 minutes. Manual cleanup:

```sql
DELETE FROM curator_email_codes
WHERE expires_at < datetime('now');
```

### Adjusting Risk Sensitivity

Risk evaluation is configured in `server/utils/signupRiskEvaluator.js`. Modify allowlists:

```javascript
const ALLOWED_COUNTRIES = ['AU', 'US', 'GB', 'NZ'];
const COMMON_TLDS = ['com', 'net', 'org', 'edu', 'io', 'co', 'dev'];
```

## Testing

### Test Scenarios

1. **Open signup trusted traffic** - AU/US/GB/NZ IP, common TLD: no verification
2. **Open signup suspicious traffic** - Non-allowed country: verification required
3. **Open signup uncommon TLD** - `.xyz` email: verification required
4. **Referral signup** - Requires valid code regardless of open signup setting
5. **Code retry limits** - 5 attempts then lockout
6. **Resend cooldown** - 60 seconds between resends

### Development Testing

Use `MOCK_EMAIL=true` to skip actual email sending. Verification codes logged to console.

Override country detection in development:
```javascript
// In request handler
const country = process.env.NODE_ENV === 'development'
  ? 'AU'
  : req.headers['cf-ipcountry'];
```
