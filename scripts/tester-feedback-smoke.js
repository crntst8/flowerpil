#!/usr/bin/env node

import crypto from 'crypto';
import { seedTestCurator } from '../tests/utils/seed.js';
import { initializeDatabase, getQueries, getDatabase } from '../server/database/db.js';

const API_BASE = process.env.SMOKE_API_BASE || 'http://localhost:3000';

const getSetCookies = (response) => {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  if (typeof response.headers.raw === 'function') {
    return response.headers.raw()['set-cookie'] || [];
  }
  const cookieHeader = response.headers.get('set-cookie');
  return cookieHeader ? [cookieHeader] : [];
};

const main = async () => {
  await initializeDatabase();
  const queries = getQueries();
  const db = getDatabase();

  const email = 'smoke-tester@flowerpil.dev';
  const password = 'SmokeTest123!';

  const existing = queries.findAdminUserByUsername.get(email);
  if (existing) {
    if (existing.curator_id) {
      db.prepare('DELETE FROM tester_feedback WHERE curator_id = ?').run(existing.curator_id);
      db.prepare('DELETE FROM curators WHERE id = ?').run(existing.curator_id);
    }
    db.prepare('DELETE FROM tester_feedback WHERE user_id = ?').run(existing.id);
    queries.deleteAdminUser.run(existing.id);
  }

  console.log('→ Seeding tester curator account…');
  const seeded = await seedTestCurator({ email, password, tester: true });
  queries.setCuratorTester.run(1, seeded.curatorId);
  console.log(`   Curator ID: ${seeded.curatorId}`);

  console.log('→ Logging in via API…');
  const loginResponse = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password })
  });

  const loginBody = await loginResponse.json();
  if (!loginResponse.ok) {
    console.error('Login failed:', loginBody);
    process.exit(1);
  }

  const cookies = getSetCookies(loginResponse)
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

  const csrfToken = loginBody.csrfToken;
  if (!csrfToken) {
    console.error('Missing CSRF token in login response.');
    process.exit(1);
  }

  const actionId = crypto.randomUUID();
  console.log('→ Submitting tester feedback batch…');
  const feedbackResponse = await fetch(`${API_BASE}/api/v1/tester-feedback/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: cookies
    },
    body: JSON.stringify({
      entries: [
        {
          action_id: actionId,
          url: 'https://flowerpil.dev/dashboard',
          message: 'Smoke test feedback submission',
          metadata: {
            smoke_test: true,
            submitted_at: new Date().toISOString()
          }
        }
      ]
    })
  });

  const feedbackBody = await feedbackResponse.json();
  if (!feedbackResponse.ok || !feedbackBody.success) {
    console.error('Feedback submission failed:', feedbackBody);
    process.exit(1);
  }
  console.log('   Submission accepted. Request ID:', feedbackBody.request_id);

  const row = db.prepare('SELECT * FROM tester_feedback WHERE action_id = ?').get(actionId);
  if (!row) {
    console.error('❌ Feedback row not persisted in tester_feedback table.');
    process.exit(1);
  }
  console.log(`   Feedback stored with id=${row.id}, url=${row.url}`);

  console.log('\nNext steps (manual):');
  console.log('  1. Ensure logging server is running (npm run logging:dev).');
  console.log('  2. POST tester_feedback outbox to logging server or wait for sync.');
  console.log('  3. Visit logging UI and filter by email:', email);
  console.log('  4. Use “View logs” on the smoke test row to confirm correlation.');

  console.log('\n✅ Smoke script completed successfully.');
};

main().catch((error) => {
  console.error('Smoke script failed:', error);
  process.exit(1);
});
