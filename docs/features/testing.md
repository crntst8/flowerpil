# Testing Guide for Flowerpil

## Introduction

This guide explains the testing infrastructure at Flowerpil in a practical, approachable way. If you're new to testing, welcome! If you're experienced, you'll find our specific patterns and conventions here.

## Why We Test

Testing gives us confidence that our code works as expected and doesn't break existing functionality. At Flowerpil, we test because:

1. **User Experience**: Our curators depend on playlists syncing correctly, auth staying secure, and exports working reliably
2. **Speed**: Catching bugs in tests is faster than finding them in production
3. **Documentation**: Tests show how our code is meant to be used
4. **Refactoring**: We can improve code confidently when tests have our back

## Testing Stack Overview

We use different tools for different types of tests:

### Vitest (Unit & Integration Tests)

**What it is**: A modern, fast test runner for JavaScript/TypeScript
**What we use it for**: Testing individual functions, API endpoints, and React components
**Why we chose it**: It's fast, works great with our Vite build system, and has an excellent developer experience

Think of Vitest as the tool that lets us test small pieces of code in isolation, like testing that a password validation function rejects weak passwords.

### Playwright (End-to-End Tests)

**What it is**: A browser automation tool that acts like a real user
**What we use it for**: Testing complete user journeys (login → create playlist → publish)
**Why we chose it**: It's reliable, supports multiple browsers, and has smart waiting built-in

Playwright tests actually open a browser and click buttons, fill forms, and navigate pages just like a human would.

### Testing Library (React Testing)

**What it is**: A set of utilities for testing React components
**What we use it for**: Testing how our UI components render and respond to user interactions
**Why we chose it**: It encourages testing from the user's perspective

## Test Organization

Our tests live in three places:

```
flowerpil/
├── tests/
│   ├── e2e/                    # End-to-end browser tests
│   │   ├── auth-persistence.spec.js
│   │   ├── curator-onboarding.spec.js
│   │   └── utils.js            # Shared E2E helpers
│   ├── utils/                  # Shared test utilities
│   │   ├── seed.js             # Database seeding
│   │   ├── testApp.js          # Express app for testing
│   │   └── csrfMock.js         # CSRF token mocking
│   ├── setup.backend.js        # Backend test environment
│   └── setup.frontend.js       # Frontend test environment
│
├── server/                     # Backend code
│   └── api/
│       ├── auth.js             # Auth endpoints
│       └── __tests__/
│           └── auth.test.js    # Auth endpoint tests
│
└── src/                        # Frontend code
    └── shared/
        ├── contexts/
        │   ├── AuthContext.jsx
        │   └── __tests__/
        │       └── AuthContext.test.jsx
```

**Pattern**: Tests live next to the code they test in `__tests__` folders

## Types of Tests We Write

### 1. Backend API Tests (Vitest + Supertest)

These test our Express API endpoints without starting a real server.

**Example scenario**: Testing login endpoint

```javascript
// server/api/__tests__/auth.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator } from '../../../tests/utils/seed.js';

const app = createTestApp();

describe('POST /api/v1/auth/login', () => {
  it('should login successfully with valid credentials', async () => {
    // Arrange: Create a test user
    const curator = await seedTestCurator({
      email: 'test@test.com',
      password: 'SecurePass123!'
    });

    // Act: Try to login
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: curator.email,
        password: curator.password
      });

    // Assert: Check it worked
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe(curator.email);
  });
});
```

**Key concepts**:
- `describe`: Groups related tests
- `it`: Defines a single test case
- `expect`: Makes assertions about the result
- Follows **AAA pattern**: Arrange, Act, Assert

### 2. Frontend Component Tests (Vitest + React Testing Library)

These test React components by rendering them and simulating user interactions.

**Example scenario**: Testing the login form

```javascript
// src/modules/curator/components/__tests__/CuratorLogin.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '@shared/contexts/AuthContext';
import CuratorLogin from '../CuratorLogin';

describe('CuratorLogin', () => {
  it('should call login when form is submitted', async () => {
    const mockLogin = vi.fn();

    // Render component with mocked auth
    render(
      <AuthProvider value={{ login: mockLogin }}>
        <CuratorLogin />
      </AuthProvider>
    );

    // Fill in the form
    fireEvent.change(screen.getByPlaceholderText('email'), {
      target: { value: 'curator@test.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('password'), {
      target: { value: 'SecurePass123!' }
    });

    // Submit form
    fireEvent.click(screen.getByText('Sign In'));

    // Check login was called
    expect(mockLogin).toHaveBeenCalledWith('curator@test.com', 'SecurePass123!');
  });
});
```

**Key concepts**:
- `render`: Renders a React component for testing
- `screen`: Queries for elements (by text, placeholder, role, etc.)
- `fireEvent`: Simulates user interactions
- `vi.fn()`: Creates a mock function to track calls

### 3. End-to-End Tests (Playwright)

These test complete user journeys in a real browser.

**Example scenario**: Testing curator onboarding flow

```javascript
// tests/e2e/curator-onboarding.spec.js
import { test, expect } from '@playwright/test';
import { seedTestReferral, cleanupTestData } from './utils.js';

test('should complete curator onboarding journey', async ({ page }) => {
  // Arrange: Create a referral code
  const referral = await seedTestReferral({
    email: 'newcurator@test.com',
    referralCode: 'TEST123'
  });

  // Act: Go through signup flow
  await page.goto('/signup');
  await page.fill('input[name="referralCode"]', 'TEST123');
  await page.fill('input[name="email"]', 'newcurator@test.com');
  await page.click('text=Next');

  // Set password
  await page.fill('input[name="password"]', 'SecurePass123!');
  await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
  await page.click('text=Next');

  // Fill profile
  await page.fill('input[name="curatorName"]', 'Test Curator');
  await page.click('text=Complete');

  // Assert: Should redirect to dashboard
  await expect(page).toHaveURL(/curator-admin/);
  await expect(page.locator('text=Welcome')).toBeVisible();

  // Cleanup
  await cleanupTestData({ emails: ['newcurator@test.com'] });
});
```

**Key concepts**:
- Tests run in a real browser (Chromium by default)
- `page.goto()`: Navigate to a URL
- `page.fill()`, `page.click()`: Simulate user actions
- `page.locator()`: Find elements on the page
- `toBeVisible()`: Wait for elements to appear

## Test Environment Setup

### Backend Test Environment

When `NODE_ENV=test`:

1. **In-memory database**: Tests use SQLite `:memory:` database (fast, isolated)
2. **Migration execution**: All migrations run once at test startup
3. **Table truncation**: Between tests, all tables are cleared (not the whole DB)
4. **Email mocking**: Emails don't actually send; `MOCK_EMAIL=true` is automatic

```javascript
// tests/setup.backend.js
beforeEach(async () => {
  // Clear all tables but keep schema intact
  const tables = getAllTables();
  tables.forEach(table => db.exec(`DELETE FROM ${table}`));
});
```

### Frontend Test Environment

1. **JSDOM**: A simulated browser environment (no real browser needed)
2. **Mock APIs**: `global.fetch` is mocked to avoid real API calls
3. **Mock CSRF**: CSRF tokens are mocked via `document.cookie`

## Special Test Utilities

### Database Seeding

Instead of manually inserting test data every time, we have helper functions:

```javascript
import { seedTestCurator, seedTestPlaylist } from '@/tests/utils/seed.js';

// Create a test curator account
const curator = await seedTestCurator({
  email: 'curator@test.com',
  password: 'TestPass123!',
  curatorName: 'DJ Test'
});

// curator.userId, curator.curatorId, curator.password (plain) are available

// Create a playlist for testing
const playlist = await seedTestPlaylist({
  curatorId: curator.curatorId,
  title: 'Summer Vibes',
  trackCount: 10
});
```

### Email Testing (Brevo SMTP)

Our email service automatically skips real sending in test mode:

```javascript
// server/utils/emailService.js
const shouldMockEmails = () => {
  if (process.env.MOCK_EMAIL === 'true') return true;
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_EMAIL !== 'false') return true;
  return false;
};
```

**In tests**: Emails return `{ success: true, messageId: 'mock-message' }` without actually sending.

**In production**: Real emails send via Brevo SMTP.

### CSRF Token Mocking

CSRF protection is active in tests. We mock tokens like this:

```javascript
import { mockCSRFToken } from '@/tests/utils/csrfMock.js';

beforeEach(() => {
  mockCSRFToken('test-csrf-token-123');
});

// Now API calls will include this token automatically
```

## Running Tests

### Quick Commands

```bash
# Run all unit tests (backend + frontend)
npm run test:unit

# Run only backend tests
npm run test:unit:backend

# Run only frontend tests
npm run test:unit:frontend

# Run tests in watch mode (reruns on file changes)
npm run test:unit:watch

# Run E2E tests
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

### Watch Mode (Recommended for Development)

```bash
npm run test:unit:watch
```

This will:
- Watch for file changes
- Re-run related tests automatically
- Show results instantly

### UI Mode (Visual Test Runner)

```bash
npm run test:unit:ui
```

Opens a browser interface where you can:
- See all tests visually
- Click to run specific tests
- See test code and results side-by-side

## Writing Good Tests

### Test Naming Convention

Use "should [action] when [condition]" format:

**Good**:
```javascript
it('should lock account after 5 failed login attempts', async () => { ... });
it('should reject weak passwords during signup', async () => { ... });
it('should preserve auth across page refresh', async () => { ... });
```

**Bad**:
```javascript
it('test login', async () => { ... });
it('password validation', async () => { ... });
it('works correctly', async () => { ... });
```

### AAA Pattern (Arrange, Act, Assert)

```javascript
it('should save playlist draft with valid data', async () => {
  // ARRANGE: Set up test data and prerequisites
  const curator = await seedTestCurator({ ... });
  const playlistData = {
    title: 'Summer Hits',
    description: 'Chill vibes for sunny days'
  };

  // ACT: Perform the action being tested
  const response = await request(app)
    .post('/api/v1/playlists')
    .send(playlistData);

  // ASSERT: Verify the outcome
  expect(response.status).toBe(201);
  expect(response.body.playlist.title).toBe('Summer Hits');
  expect(response.body.playlist.status).toBe('draft');
});
```

### What to Test vs What to Skip

**DO test**:
- User-facing functionality (login, signup, playlist creation)
- Business logic (playlist validation, export formatting)
- Edge cases (empty inputs, expired tokens, locked accounts)
- Error handling (invalid data, network failures)
- Security (CSRF protection, password strength, auth checks)

**DON'T test**:
- Third-party libraries (React, Express already tested)
- Simple getters/setters with no logic
- Framework code
- Generated code

### Test Independence

Each test should be able to run alone without depending on other tests:

```javascript
// GOOD: Each test is independent
describe('Playlist API', () => {
  it('should create playlist', async () => {
    const curator = await seedTestCurator({ ... }); // Own setup
    const response = await request(app).post('/api/v1/playlists').send({ ... });
    expect(response.status).toBe(201);
  });

  it('should update playlist', async () => {
    const curator = await seedTestCurator({ ... }); // Own setup
    const playlist = await seedTestPlaylist({ ... }); // Own setup
    const response = await request(app).put(`/api/v1/playlists/${playlist.id}`).send({ ... });
    expect(response.status).toBe(200);
  });
});
```

## Coverage Targets

We aim for these coverage levels:

| Area | Target | Why |
|------|--------|-----|
| Auth endpoints | 80%+ | Security-critical |
| Backend overall | 70%+ | Business logic |
| Frontend | 65%+ | UI less critical than logic |
| E2E critical paths | 100% | User journeys must work |

**View coverage**:
```bash
npm run test:coverage
# Opens HTML report in browser showing what's covered
```

## Common Testing Patterns

### Testing Authenticated Endpoints

```javascript
it('should require authentication to create playlist', async () => {
  const response = await request(app)
    .post('/api/v1/playlists')
    .send({ title: 'Test' });

  expect(response.status).toBe(401);
  expect(response.body.error).toMatch(/authentication/i);
});

it('should create playlist when authenticated', async () => {
  const curator = await seedTestCurator({ ... });

  // Login to get auth cookie
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: curator.email, password: curator.password });

  const cookies = loginRes.headers['set-cookie'];

  // Use auth cookie in request
  const response = await request(app)
    .post('/api/v1/playlists')
    .set('Cookie', cookies)
    .send({ title: 'Authenticated Playlist' });

  expect(response.status).toBe(201);
});
```

### Testing Async Operations

```javascript
// Use async/await for API calls
it('should verify email code', async () => {
  const code = await seedTestEmailCode({ ... });

  const response = await request(app)
    .post('/api/v1/auth/verify')
    .send({ email: 'test@test.com', code: code.plainCode });

  expect(response.status).toBe(200);
});

// E2E tests wait automatically
test('should load playlists', async ({ page }) => {
  await page.goto('/curator-admin/playlists');

  // Playwright waits for element automatically
  await expect(page.locator('.playlist-card').first()).toBeVisible();
});
```

### Testing Error States

```javascript
it('should return 400 for invalid email format', async () => {
  const response = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      email: 'not-an-email',
      password: 'ValidPass123!'
    });

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/email/i);
});

it('should show error message in UI', () => {
  render(<SignupForm />);

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'not-an-email' }
  });
  fireEvent.blur(screen.getByLabelText('Email'));

  expect(screen.getByText(/valid email/i)).toBeVisible();
});
```

## Debugging Tests

### Vitest Debugging

**See test output**:
```javascript
it('should do something', async () => {
  const result = await someFunction();
  console.log('Result:', result); // Shows in test output
  expect(result).toBe(expected);
});
```

**Run single test**:
```javascript
it.only('should focus on this test', async () => {
  // Only this test runs
});
```

**Skip a test temporarily**:
```javascript
it.skip('should fix this later', async () => {
  // Test is skipped
});
```

### Playwright Debugging

**Run in headed mode** (see browser):
```bash
npx playwright test --headed
```

**Debug mode** (step through test):
```bash
npx playwright test --debug
```

**Screenshot on failure**:
```javascript
test('should show dashboard', async ({ page }) => {
  await page.goto('/curator-admin');
  await page.screenshot({ path: 'debug-dashboard.png' });
  await expect(page.locator('.dashboard')).toBeVisible();
});
```

## CI/CD Integration

Tests run automatically on:
- Every push to `master`, `dev`, `dsp-wiz-refactor`
- Every pull request

**GitHub Actions workflow** runs:
1. Unit tests (backend + frontend)
2. E2E tests
3. Coverage reports uploaded to Codecov

## Troubleshooting

### "EPERM: operation not permitted" (Backend tests)

**Cause**: Sandbox doesn't allow Express server binding
**Solution**: Run tests on host system or use Docker

### "Element not found" (E2E tests)

**Cause**: Page not loaded or selector wrong
**Solution**: Add `await page.waitForLoadState('networkidle')` or check selector

### "Database is locked" (Backend tests)

**Cause**: SQLite WAL mode or concurrent access
**Solution**: Tests run sequentially by default; check for orphaned connections

### Tests pass locally but fail in CI

**Cause**: Timing issues, environment differences
**Solution**: Increase timeouts, check environment variables, use `waitFor` helpers

## Getting Help

- **Documentation**: `/llm/cc/TESTING_IMPLEMENTATION_PLAN.md`
- **Examples**: Look at existing tests in `server/api/__tests__/` and `tests/e2e/`
- **Ask**: Team members who've written tests recently

## Next Steps

1. **Read existing tests** in `server/api/__tests__/auth.test.js` to see patterns
2. **Run tests** with `npm run test:unit:watch` to see them in action
3. **Write your first test** for a simple function
4. **Practice** with the AAA pattern (Arrange, Act, Assert)

Happy testing!
