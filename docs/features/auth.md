# Authentication System

Comprehensive guide to Flowerpil's authentication implementation covering JWT-based auth, password management, CSRF protection, role-based access control, and security features.

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [Core Components](#core-components)
4. [API Endpoints](#api-endpoints)
5. [Security Features](#security-features)
6. [Role-Based Access Control](#role-based-access-control)
7. [Frontend Integration](#frontend-integration)
8. [Database Schema](#database-schema)
9. [Environment Configuration](#environment-configuration)
10. [Deployment](#deployment)
11. [Testing](#testing)

## Overview

The system implements JWT-based stateless authentication with comprehensive security measures including account lockout, CSRF protection, rate limiting, and audit logging. Three user types are supported:

- **Admin users** - Full system access, user management, settings control
- **Curator users** - Playlist creation/management, curator dashboard access
- **Public users** - Email-verified accounts for personal features

## Authentication Methods

### JWT Tokens

Stateless authentication using JSON Web Tokens:

- **Expiry**: 14 days
- **Secret**: `JWT_SECRET` environment variable (required in production)
- **Payload**: userId, role, type ('admin_auth'), issued/expiration times, custom metadata
- **Storage**: httpOnly cookie (`auth_token`) + Bearer header support
- **Algorithm**: Default signing algorithm via jsonwebtoken library

Token utilities in `server/utils/authUtils.js`:

```javascript
generateToken(userId, role = 'admin', customExpiry = null, additionalPayload = {}) // Creates JWT with user info & role
verifyToken(token)     // Validates JWT signature & structure
refreshToken(token)    // Issues new token from old one
isTokenExpiringSoon(token, minutes) // Checks expiry proximity
```

### Password Authentication

Used for admin and curator login:

- **Hashing**: bcryptjs with 12 rounds
- **Validation**: Enforced complexity requirements
- **Timing Protection**: Minimum 200ms delay on login responses
- **Lockout**: Exponential backoff after failed attempts

Password validation rules (server/utils/authUtils.js:155):

- Minimum 8 characters
- Maximum 128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*()_+-=[]{};':"\\|,.<>/?)

### Email Verification

Used for public user signup:

- **Code Format**: 6-digit numeric code
- **Expiry**: 10 minutes
- **Rate Limit**: 5 verification attempts per code
- **Storage**: Email and code hash stored temporarily
- **Delivery**: SMTP via Brevo service

### CSRF Tokens

Double-Submit Cookie pattern for session protection:

- **Generation**: 32 random bytes, base64 encoded
- **Expiry**: 24 hours
- **Storage**: Database + httpOnly=false cookie
- **Validation**: Header token compared with cookie token
- **Revocation**: On logout, password change, password reset

## Core Components

### Middleware

File: `server/middleware/auth.js`

#### authMiddleware

Core authentication middleware that validates JWT and loads user data.

Token extraction order:
1. Authorization Bearer header
2. httpOnly cookie (`auth_token`)

User loading process:
1. Checks `admin_users` table first
2. Falls back to `users` table for public users
3. Validates active status (admin only)
4. Checks account lock status
5. Loads curator info and tester flag if applicable

Attaches to request:
- `req.user` - Full user object
- `req.userId` - User ID
- `req.role` - User role

#### optionalAuth

Allows unauthenticated access but validates token if provided. Useful for endpoints that enhance functionality for authenticated users but remain accessible to public.

#### requireRole(role)

Enforces specific role requirement. Rejects requests if user lacks specified role.

Usage:
```javascript
router.get('/curator-only', authMiddleware, requireRole('curator'), handler)
```

#### requireAdmin

Shorthand middleware for admin-only access. Equivalent to `requireRole('admin')`.

#### requireAnyRole(roles)

Multi-role authorization. Accepts array of allowed roles.

Usage:
```javascript
router.get('/protected', authMiddleware, requireAnyRole(['admin', 'curator']), handler)
```

#### checkTokenExpiry(thresholdMinutes)

Flags expiring tokens in response headers. Default threshold: 60 minutes.

Adds header: `X-Token-Expiring-Soon: true`

#### authRateLimit

Rate limiter specifically for authentication endpoints:
- Production: 15 requests per 15 minutes per IP
- Development: 100 requests per 15 minutes
- Test: Unlimited

### CSRF Protection

File: `server/middleware/csrfProtection.js`

#### generateCSRFToken(userId)

Creates CSRF token and stores in database + cookie.

Returns: `{ token, cookieOptions }`

#### validateCSRFToken

Middleware that validates CSRF tokens on non-GET/HEAD/OPTIONS requests.

Validation process:
1. Skip for safe methods (GET/HEAD/OPTIONS)
2. Extract token from `X-CSRF-Token` header
3. Compare with cookie token (timing-safe comparison)
4. Fall back to database check
5. Log mismatch events

Exemptions:
- Worker requests with valid `X-Worker-Key` header

Cookie configuration:
- Domain: Auto-resolved for subdomain sharing or `CSRF_COOKIE_DOMAIN` env variable
- SameSite: Lax
- Secure: Production only
- HttpOnly: false (client needs read access)
- Path: /

#### revokeUserCSRFTokens(userId)

Deletes all CSRF tokens for specified user. Called during:
- Logout
- Password change
- Password reset

Auto-cleanup runs hourly to remove expired tokens.

### Password Management

File: `server/utils/authUtils.js`

#### hashPassword(password)

Hashes password with bcryptjs (12 rounds).

#### verifyPassword(password, hash)

Compares plain password with bcrypt hash. Returns boolean.

#### validatePasswordComplexity(password)

Validates password against complexity requirements. Returns:
```javascript
{ valid: boolean, errors: string[] }
```

#### generatePasswordResetToken()

Creates cryptographically secure reset token (32 bytes, hex encoded).

Returns: `{ token, hash }` where hash is SHA-256 for database storage.

### Account Lockout

File: `server/utils/securityLogger.js`

#### trackFailedLogin(username, ip, userAgent)

Records failed login attempt in `failed_login_attempts` table.

#### isAccountLocked(username)

Checks lockout status and returns:
```javascript
{
  locked: boolean,
  lockedUntil: Date | null,
  attemptCount: number
}
```

Lockout schedule (exponential backoff):
- 1-4 attempts: No lockout
- 5-7 attempts: 1 minute
- 8-10 attempts: 5 minutes
- 11-15 attempts: 15 minutes
- 16-20 attempts: 30 minutes
- 21-30 attempts: 60 minutes
- 31+ attempts: 240 minutes

#### lockAccount(username, attemptCount)

Creates or updates entry in `account_lockouts` table with calculated `locked_until` timestamp.

#### unlockAccount(username)

Clears lockout record from `account_lockouts` table.

#### resetFailedAttempts(username)

Removes failed login tracking data for user after successful login.

### Security Event Logging

File: `server/utils/securityLogger.js`

#### logSecurityEvent(eventData)

Records security-relevant events to `security_events` table.

Event types:
- LOGIN_SUCCESS, LOGIN_FAILURE
- USER_CREATION, PASSWORD_CHANGE
- PASSWORD_RESET_REQUEST, PASSWORD_RESET_SUCCESS
- ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
- CSRF_TOKEN_MISMATCH
- RATE_LIMIT_EXCEEDED
- SUSPICIOUS_ACTIVITY, ADMIN_ACTION

Event data structure:
```javascript
{
  eventType: string,
  ipAddress: string,
  userId: number | null,
  username: string | null,
  userAgent: string,
  endpoint: string,
  details: object // JSON serialized
}
```

Retention: 90 days (configurable via cleanup job).

### Rate Limiting

File: `server/middleware/rateLimiting.js`

Multiple rate limiters protect different endpoint categories:

| Limiter | Window | Limit (Prod) | Dev | Test | Key Type |
|---------|--------|--------------|-----|------|----------|
| Auth attempts | 15 min | 15 | 100 | unlimited | IP |
| Password change | 1 hour | 3 | 10 | unlimited | User ID |
| Password reset | 1 hour | 3 | 10 | unlimited | IP |
| Admin API | 15 min | 100 | 500 | unlimited | User ID or IP |
| Uploads | 1 hour | 10 | 50 | unlimited | User ID or IP |
| Public API | 15 min | 300 | 1000 | unlimited | IP |
| Site access | 15 min | 15 | 20 | unlimited | Exempt IPs |
| Tester feedback | 1 min | 15 | 40 | unlimited | User ID |

Exempt IP addresses:
- 103.252.195.186
- 2401:2520:20b7:0:dde6:3e8c:bd3e:f12e
- 45.134.39.248
- 100.64.0.* (Tailscale range)

Rate limit exceeded triggers:
1. HTTP 429 response
2. Security event log entry
3. Standardized error message

## API Endpoints

File: `server/api/auth.js`

All endpoints are rate-limited via `authRateLimit` middleware.

### POST /api/v1/auth/login

Admin and curator authentication.

**Request:**
```javascript
{
  username: string, // Email address
  password: string
}
```

**Response (200):**
```javascript
{
  user: {
    id: number,
    username: string,
    role: string,
    curator_id: number | null,
    is_tester: boolean
  },
  token: string,
  csrfToken: string,
  expiresAt: string // ISO timestamp
}
```

**Response (401):** Invalid credentials or account locked

**Response (403):** Account disabled

**Security measures:**
- Timing attack protection (min 200ms delay)
- Account lockout tracking
- Failed attempt logging
- CSRF token generation

Sets cookies:
- `auth_token` (httpOnly, secure in production)
- `csrf_token` (httpOnly=false for client read)

### POST /api/v1/auth/logout

Clears authentication and CSRF tokens.

**Authentication:** Required

**Response (200):**
```javascript
{
  message: "Logged out successfully"
}
```

Clears cookies and revokes CSRF tokens from database.

### POST /api/v1/auth/signup

Public user account creation with email verification.

**Request:**
```javascript
{
  email: string,
  password: string
}
```

**Response (200):**
```javascript
{
  message: "Verification email sent",
  requiresVerification: true
}
```

**Response (409):** Email already exists

**Process:**
1. Validates email and password complexity
2. Generates 6-digit verification code
3. Sends email via SMTP
4. Stores email and code hash temporarily
5. Code expires in 10 minutes

### POST /api/v1/auth/verify

Email verification code validation and JWT issuance.

**Request:**
```javascript
{
  email: string,
  code: string // 6-digit code
}
```

**Response (200):**
```javascript
{
  user: {
    id: number,
    email: string,
    role: "user"
  },
  token: string,
  expiresAt: string
}
```

**Response (400):** Invalid or expired code

**Rate limit:** 5 attempts per code

**Process:**
1. Validates code against hash
2. Creates entry in `users` table
3. Generates JWT token
4. Cleans up verification data

### POST /api/v1/auth/password/reset-request

Initiates password reset flow.

**Request:**
```javascript
{
  email: string
}
```

**Response (200):**
```javascript
{
  message: "If that email exists, a reset link has been sent"
}
```

**Rate limit:** 3 requests per hour per IP

**Security:**
- No user enumeration (always returns success message)
- Token expiry: 60 minutes (configurable via `PASSWORD_RESET_EXP_MINUTES`)
- Token hash stored (SHA-256)

**Email content:**
- Reset link: `{PASSWORD_RESET_LINK_BASE}?token={token}`
- Default base: https://flowerpil.io/reset-password

### POST /api/v1/auth/password/reset

Applies new password using reset token.

**Request:**
```javascript
{
  token: string,
  newPassword: string
}
```

**Response (200):**
```javascript
{
  message: "Password reset successfully"
}
```

**Response (400):** Invalid or expired token

**Response (422):** Password complexity validation failed

**Process:**
1. Validates token hash (SHA-256)
2. Checks expiration
3. Validates new password complexity
4. Updates password hash
5. Revokes all CSRF tokens (session invalidation)
6. Logs security event

**Known limitation:** JWT tokens remain valid until expiry despite password change. See server/api/auth.js:671-672 for TODO regarding JWT token versioning.

### POST /api/v1/auth/change-password

Authenticated password change.

**Authentication:** Required

**Request:**
```javascript
{
  currentPassword: string,
  newPassword: string
}
```

**Response (200):**
```javascript
{
  message: "Password updated successfully"
}
```

**Response (401):** Current password incorrect

**Response (422):** New password validation failed

**Rate limit:** 3 requests per hour per user

**Process:**
1. Verifies current password
2. Validates new password complexity
3. Updates password hash
4. Revokes all CSRF tokens
5. Logs security event

**Known limitation:** Same as password reset - JWT tokens remain valid until expiry. See server/api/auth.js:773-774.

### POST /api/v1/auth/change-email

Changes login username/email.

**Authentication:** Required

**Request:**
```javascript
{
  password: string,
  newEmail: string
}
```

**Response (200):**
```javascript
{
  message: "Email updated successfully",
  newEmail: string
}
```

**Response (401):** Password incorrect

**Response (409):** Email already in use

**Process:**
1. Verifies password
2. Validates new email format
3. Checks uniqueness
4. Updates username in `admin_users` table
5. Logs security event

### POST /api/v1/auth/curator/verify-referral

Pre-signup validation of curator referral code.

**Request:**
```javascript
{
  code: string,
  email: string
}
```

**Response (200):**
```javascript
{
  valid: true,
  referral: {
    curator_name: string,
    email: string
  }
}
```

**Response (400):** Invalid or used referral code, email mismatch

### POST /api/v1/auth/curator/signup

Curator account creation via referral code.

**Request:**
```javascript
{
  referralCode: string,
  email: string,
  password: string,
  curatorProfile: {
    curatorName: string,
    curatorType: string,
    location: string | null
  }
}
```

**Response (201):**
```javascript
{
  success: true,
  user: {
    id: number,
    username: string,
    role: "curator",
    curator_id: number
  },
  csrfToken: string
}
```

**Process:**
1. Validates referral code (unused, email match)
2. Creates `admin_users` entry with curator role
3. Creates curator profile with name, type, location
4. Links to curator profile via `curator_id`
5. Marks referral as used
6. Generates JWT and CSRF tokens

**Frontend Onboarding Flow:**

The curator signup wizard (`CuratorSignup.jsx`) guides users through 5 streamlined steps:

1. **Sign Up** - Email and referral code validation
2. **Password** - Secure password with strength indicator and show/hide toggle
3. **Identity** - Profile name, type, and optional location
4. **pil.bio** - Reserve personal link-in-bio handle
5. **Profile Image** - Optional avatar upload

DSP configuration is deferred to the first playlist creation (just-in-time approach) to reduce cognitive load during onboarding.

### GET /api/v1/auth/status

Check authentication status without requiring authentication.

**Response (200) - Authenticated:**
```javascript
{
  authenticated: true,
  user: {
    id: number,
    username: string,
    role: string,
    curator_id: number | null,
    is_tester: boolean
  },
  csrfToken: string,
  tokenExpiry: string
}
```

**Response (200) - Unauthenticated:**
```javascript
{
  authenticated: false,
  csrfToken: string
}
```

**Behavior:**
- Auto-regenerates CSRF token if missing
- Validates JWT token if present
- Returns user info for authenticated requests

### POST /api/v1/auth/dev/quick-login

Development-only bypass for password authentication.

**Environment:** Only available when `NODE_ENV !== 'production'`

**Request:**
```javascript
{
  username: string
}
```

**Response:** Same as standard login

**Warning:** Immediately returns 404 in production. Never deploy code that calls this endpoint.

## Security Features

### Timing Attack Protection

Login endpoint enforces minimum 200ms response time to prevent timing-based user enumeration.

Implementation in server/api/auth.js:

```javascript
const startTime = Date.now()
// ... authentication logic ...
const elapsed = Date.now() - startTime
if (elapsed < MIN_DELAY_MS) {
  await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed))
}
```

### Brute Force Defense

Multi-layered protection:

1. **Rate limiting** - IP-based request throttling (15 requests per 15 minutes)
2. **Account lockout** - Exponential backoff based on failed attempts
3. **Failed attempt tracking** - Per-username and per-IP monitoring
4. **Security event logging** - Audit trail for investigation

### Session Invalidation

Password changes and resets trigger CSRF token revocation to invalidate sessions requiring CSRF validation.

**Current limitation:** JWT tokens remain valid until expiry. Enhancement path documented in server/api/auth.js:671-672 suggests implementing JWT token versioning by adding `token_version` field to `admin_users` table and incrementing on password change.

### Input Validation

All auth endpoints use Joi schema validation:

- Email format validation
- Password complexity enforcement
- Token format verification
- Request body structure validation

Invalid input returns 422 with detailed error messages.

### Audit Logging

Comprehensive security event tracking via `security_events` table:

- All authentication attempts (success/failure)
- Password changes and resets
- Account lockouts/unlocks
- CSRF token mismatches
- Rate limit violations
- Administrative actions

Event data includes:
- IP address
- User agent
- Username
- Endpoint
- Detailed context (JSON)
- Timestamp

Retention: 90 days

### Helmet Security Headers

Applied via `helmet` middleware in server/index.js:

- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

### CORS Configuration

Environment-specific CORS settings:

- Production: Restricted origin list
- Development: localhost:5173 and local IP
- Credentials: Always enabled for cookie transmission

## Role-Based Access Control

Three primary roles:

- **admin** - Full system access, user management, settings control
- **curator** - Playlist management, curator dashboard access
- **user** - Public user features only
- **super_admin** - Reserved for future elevated privileges

### Role Enforcement Patterns

```javascript
// Single role requirement
router.get('/admin-only', authMiddleware, requireAdmin, handler)

// Multiple role options
router.get('/protected', authMiddleware, requireAnyRole(['admin', 'curator']), handler)

// Optional authentication with enhanced features
router.get('/public', optionalAuth, handler)
```

### Protected Endpoint Categories

**Admin-only routes (requireAdmin):**
- `/api/v1/admin/dashboard/*` - System metrics and monitoring
- `/api/v1/admin/site-admin/*` - Site configuration management
- `/api/v1/admin/system-config/*` - System settings
- `/api/v1/admin/dsp/*` - DSP token management
- `/api/v1/admin/referrals/*` - Referral code management
- `/api/v1/admin/requests/*` - Request tracking
- `/api/v1/admin/scheduled-imports/*` - Import scheduling
- `/api/v1/admin/apple-share/*` - Apple Music integration

**Curator + Admin routes (requireAnyRole):**
- Playlist creation and management
- Curator profile management
- Analytics access

**Authenticated routes (authMiddleware):**
- Personal account management
- Preference updates
- Private data access

**Public routes (optionalAuth or no auth):**
- Playlist browsing
- Search functionality
- Public curator profiles

## Frontend Integration

File: `src/shared/contexts/AuthContext.jsx`

### AuthProvider

React Context provider that manages authentication state throughout application.

**State:**
```javascript
{
  user: object | null,
  isAuthenticated: boolean,
  isLoading: boolean,
  error: string | null,
  errorType: string | null,
  tokenExpiry: string | null
}
```

**Error types:**
- `invalid_credentials` - Wrong username/password
- `account_locked` - Too many failed attempts
- `account_disabled` - Account marked inactive
- `rate_limit_exceeded` - Too many requests
- `network_error` - Connection issues

### Authentication Methods

#### login(username, password)

Authenticates admin or curator user.

```javascript
const { login } = useAuth()
await login('user@example.com', 'Password123!')
```

**Success:** Updates context state with user info and token expiry

**Failure:** Sets error state with type and message

#### signup(email, password)

Initiates public user signup with email verification.

```javascript
const { signup } = useAuth()
await signup('user@example.com', 'Password123!')
// User must then verify email with 6-digit code
```

#### verifyEmail(email, code)

Completes signup by verifying email code.

```javascript
const { verifyEmail } = useAuth()
await verifyEmail('user@example.com', '123456')
```

**Success:** Authenticates user and stores JWT

#### logout()

Clears authentication state and server-side tokens.

```javascript
const { logout } = useAuth()
await logout()
```

Also clears any cached data.

#### requestPasswordReset(email)

Sends password reset email.

```javascript
const { requestPasswordReset } = useAuth()
await requestPasswordReset('user@example.com')
```

#### resetPassword(token, newPassword)

Completes password reset flow.

```javascript
const { resetPassword } = useAuth()
await resetPassword(resetToken, 'NewPassword123!')
```

### Authenticated Fetch

All API requests via `authenticatedFetch` function include:

- Credentials (cookies)
- CSRF token via `X-CSRF-Token` header
- Automatic 401 handling (logout + redirect)
- Cache clearing on auth expiration

Usage:
```javascript
const response = await authenticatedFetch('/api/v1/protected', {
  method: 'POST',
  body: JSON.stringify(data)
})
```

### Auth State Synchronization

Context monitors browser events to maintain auth state:

1. **Component mount** - Initial auth status check
2. **Tab visibility change** - Re-check when returning to tab
3. **Page show event** - Re-check on browser back/forward
4. **Custom auth-expired event** - Global auth state updates

Pattern for components:
```javascript
const { user, isAuthenticated, isLoading } = useAuth()

if (isLoading) return <LoadingSpinner />
if (!isAuthenticated) return <Navigate to="/login" />
return <ProtectedContent user={user} />
```

## Database Schema

### admin_users

Core user table for admin and curator accounts.

```sql
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'curator', 'super_admin')),
  is_active INTEGER DEFAULT 1,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  curator_id INTEGER,
  email TEXT,
  FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE SET NULL
)
```

**Indexes:**
- `idx_admin_users_username` - Fast username lookup
- `idx_admin_users_is_active` - Active user filtering
- `idx_admin_users_locked_until` - Lockout queries

### users

Public user accounts (email-verified signups).

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
)
```

### csrf_tokens

Double-submit cookie pattern token storage.

```sql
CREATE TABLE csrf_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
)
```

**Indexes:**
- `idx_csrf_tokens_token` - Fast token validation
- `idx_csrf_tokens_user_expires` - User token queries with expiry check

**Cleanup:** Hourly job removes expired tokens.

### failed_login_attempts

Tracks authentication failures for brute force detection.

```sql
CREATE TABLE failed_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  username TEXT NOT NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT
)
```

**Indexes:**
- `idx_failed_login_ip` - IP-based queries
- `idx_failed_login_username` - Username-based queries

### account_lockouts

Current lockout state for accounts.

```sql
CREATE TABLE account_lockouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  locked_until DATETIME NOT NULL,
  attempt_count INTEGER NOT NULL
)
```

**Indexes:**
- `idx_account_lockouts_username` - Lockout checks
- `idx_account_lockouts_locked_until` - Expiry queries

### security_events

Comprehensive audit log.

```sql
CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_id INTEGER,
  username TEXT,
  details TEXT,
  user_agent TEXT,
  endpoint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Indexes:**
- `idx_security_events_type_time` - Event type analysis
- `idx_security_events_ip_time` - IP-based investigation
- `idx_security_events_user_time` - User activity tracking

**Retention:** 90 days (configurable)

### password_reset_tokens

Temporary reset tokens (stored as SHA-256 hashes).

```sql
CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
)
```

**Indexes:**
- `idx_password_reset_tokens_hash` - Token validation
- `idx_password_reset_tokens_expires` - Cleanup queries

## Environment Configuration

### Required Variables

**JWT_SECRET**

Cryptographic secret for JWT signing and verification.

- Format: 64-character hexadecimal string
- Generation: `openssl rand -hex 32`
- Storage: `/etc/environment` in production
- Critical: Must remain secret and constant

**EMAIL_FROM_PASSWORDRESET**

Sender address for password reset emails.

Example: `noreply@flowerpil.io`

**EMAIL_FROM_SIGNUP**

Sender address for signup verification emails.

**EMAIL_FROM_REFERRAL**

Sender address for curator referral emails.

**BREVO_USER** or **BREVO_EMAIL**

SMTP authentication username (Brevo service).

**BREVO_PASS** or **BREVO_SMTP_PASSWORD**

SMTP authentication password (Brevo service).

### Optional Variables

**PASSWORD_RESET_EXP_MINUTES**

Reset token expiry in minutes.

- Default: 60
- Range: 5-120 recommended

**PASSWORD_RESET_LINK_BASE**

Frontend base URL for reset links.

- Default: https://flowerpil.io/reset-password
- Format: `{BASE}?token={token}`

**CSRF_COOKIE_DOMAIN**

Override auto-detected cookie domain.

- Default: Auto-resolved from request host
- Example: `.flowerpil.io` for subdomain sharing
- Use case: Complex domain configurations

**BREVO_HOST**

SMTP server hostname.

- Default: smtp-relay.brevo.com
- Port: 587 (STARTTLS)

**BREVO_PORT**

SMTP server port.

- Default: 587

**MOCK_EMAIL**

Disable actual email sending for development/testing.

- Set to: `'true'` (string)
- Effect: Logs email content instead of sending

**DATABASE_URL** or **DATABASE_PATH**

SQLite database file path.

- Production: `/var/www/flowerpil/data/flowerpil.db`
- Development: `./data/flowerpil.db`

**NODE_ENV**

Execution environment.

- Values: `development`, `test`, `production`
- Affects: Rate limits, CORS, security headers, cookie flags

**PORT**

Server listening port.

- Default: 3000
- Production: Proxied via NGINX

## Deployment

### Production Environment

**Server:** Ubuntu 24.04

**Runtime:** Node.js 24.8.0

**Database:** SQLite 3.45.1

**Process Manager:** PM2

**Reverse Proxy:** NGINX (port 3000)

**Frontend:** Cloudflare Pages

### Deployment Steps

#### API Server

```bash
cd /var/www/flowerpil
source /etc/environment  # Load JWT_SECRET and other secrets
pm2 start ecosystem.config.cjs --env production
```

**Critical:** Always `source /etc/environment` before starting PM2 to load secrets.

#### Frontend

```bash
npm run build
wrangler pages deploy dist --project-name=flowerpil-frontend --branch=prod
```

**Security:** Never commit secrets to frontend code or environment. All auth tokens transmitted via httpOnly cookies.

### Server Configuration

#### PM2 Ecosystem Config

File: `ecosystem.config.cjs`

Defines process management:
- Process name
- Entry point (server/index.js)
- Instance count
- Environment variables
- Log paths
- Restart policies

#### NGINX Configuration

Reverse proxy setup:
- Listen on port 80/443
- Proxy to localhost:3000
- Trust proxy headers (2 hops: Cloudflare + NGINX)
- WebSocket support
- Static file serving

Trust proxy configuration in server/index.js:

```javascript
app.set('trust proxy', 2) // Cloudflare + NGINX
```

### Log Files

Production logs located in `/logs/`:

- `api.log` - API requests/responses
- `error.log` - Error stack traces
- `debug.log` - General application logs
- `curator.log` - Curator-specific operations
- `security.log` - Auth and security events

Retention: 90 days (configurable via log rotation)

### Health Monitoring

Monitor these indicators:

1. **PM2 process status** - `pm2 status`
2. **Failed login rate** - Query `failed_login_attempts` table
3. **Account lockouts** - Query `account_lockouts` table
4. **Security events** - Query `security_events` for anomalies
5. **Rate limit hits** - Look for 429 responses in logs

### Backup Considerations

Critical data to backup:
- `admin_users` table - User accounts
- `security_events` table - Audit trail
- JWT_SECRET - Required for existing token validation

**Warning:** Changing JWT_SECRET invalidates all existing tokens immediately.

## Testing

### Test Environment Setup

File: `tests/utils/seed.js`

**Mock authentication:**
```javascript
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only'
process.env.MOCK_EMAIL = 'true' // Skip SMTP
```

**Test user creation:**
- Admin user with known credentials
- Curator user linked to test profile
- Public user accounts

### Testing Patterns

#### Unit Tests

Test individual auth functions:
- Password hashing/verification
- Token generation/validation
- Password complexity validation
- CSRF token generation

#### Integration Tests

Test API endpoints:
- Login flow with valid/invalid credentials
- Signup and email verification
- Password reset flow
- Account lockout behavior
- Rate limiting enforcement

#### Security Tests

Verify security measures:
- Timing attack protection
- CSRF validation
- Role-based access control
- Session invalidation
- Input validation

### Test Utilities

**Generate test JWT:**
```javascript
const { generateToken } = require('../utils/authUtils.js')
const token = generateToken(1, 'admin')
// Or with additional payload:
// const token = generateToken(1, 'admin', null, { curator_id: 123 })
```

**Create test user:**
```javascript
const { hashPassword } = require('../utils/authUtils.js')
const hash = await hashPassword('TestPassword123!')
// Insert into admin_users table
```

**Mock authenticated request:**
```javascript
const response = await request(app)
  .get('/api/v1/protected')
  .set('Authorization', `Bearer ${token}`)
  .set('X-CSRF-Token', csrfToken)
```

### Rate Limit Testing

Rate limiters disabled in test environment (`NODE_ENV=test`). To test rate limiting:

1. Override environment temporarily
2. Use multiple IPs or users
3. Verify 429 responses
4. Check security event logs

## Known Limitations

### JWT Token Versioning

Password changes and resets revoke CSRF tokens but JWT tokens remain valid until expiry (14 days).

**Impact:** Users with stolen JWTs can continue accessing API until token expires even after password change.

**Workaround:** Shorter JWT expiry times trade security for user experience (more frequent re-authentication).

**Enhancement path:** Implement token versioning:
1. Add `token_version` column to `admin_users` table
2. Include version in JWT payload
3. Increment version on password change
4. Validate version on each request

References: server/api/auth.js:671-672, server/api/auth.js:773-774

### No Session Persistence

Stateless JWT approach means:
- Cannot forcibly logout user from server
- Cannot revoke individual tokens
- Cannot implement "logout all devices"

Trade-off: Simplicity and scalability vs granular session control.

### Password Reset User Enumeration

Reset request endpoint always returns success message to prevent username enumeration. However, timing differences may still leak information if database query times vary significantly.

Mitigation: Timing attack protection (min 200ms) reduces but doesn't eliminate risk.

### Rate Limiting Bypass

Rate limits use IP addresses which can be bypassed via:
- VPNs and proxies
- Distributed attacks
- IPv6 address space

Additional protection: Account lockout provides secondary defense layer independent of IP.
