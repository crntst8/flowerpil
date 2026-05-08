#!/usr/bin/env node

/**
 * Interactive environment setup for auth features
 * Generates required secrets and guides through Brevo setup
 *
 * Run: node server/dev/setupEnv.js
 */

import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');
const envPath = join(rootDir, '.env');

console.log('\n🔧 Environment Setup for Auth Features\n');

// Generate secrets
const generateSecret = () => crypto.randomBytes(32).toString('hex');

const EMAIL_CODE_PEPPER = process.env.EMAIL_CODE_PEPPER || generateSecret();
const JWT_SECRET = process.env.JWT_SECRET || generateSecret();

console.log('Generated secrets:');
console.log('─'.repeat(70));
console.log(`EMAIL_CODE_PEPPER=${EMAIL_CODE_PEPPER}`);
console.log(`JWT_SECRET=${JWT_SECRET}`);
console.log('─'.repeat(70));
console.log();

// Check if .env exists
if (fs.existsSync(envPath)) {
  console.log(`✓ Found .env at: ${envPath}`);
  console.log();
} else {
  console.log(`⚠️  No .env file found at: ${envPath}`);
  console.log('   You can create one or add to ecosystem.config.cjs env section\n');
}

// Brevo setup instructions
console.log('📧 Brevo (Email) Setup Instructions:');
console.log('─'.repeat(70));
console.log('1. Sign up at: https://www.brevo.com (free tier: 300 emails/day)');
console.log('2. Go to: SMTP & API → SMTP Settings');
console.log('3. Create a new SMTP key');
console.log('4. Copy your credentials:');
console.log();
console.log('   BREVO_HOST=smtp-relay.brevo.com');
console.log('   BREVO_PORT=587');
console.log('   BREVO_USER=<your Brevo account email>');
console.log('   BREVO_PASS=<your SMTP key from step 3>');
console.log('─'.repeat(70));
console.log();

// Show complete env template
console.log('📝 Complete .env Template:');
console.log('─'.repeat(70));
console.log(`
# Auth & Security
EMAIL_CODE_PEPPER=${EMAIL_CODE_PEPPER}
JWT_SECRET=${JWT_SECRET}

# Email (Brevo)
BREVO_HOST=smtp-relay.brevo.com
BREVO_PORT=587
BREVO_USER=your_email@example.com
BREVO_PASS=your_smtp_key_here

# Database
DATABASE_PATH=./data/flowerpil.db

# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
`.trim());
console.log('─'.repeat(70));
console.log();

// Offer to write to ecosystem.config.cjs
console.log('💡 Tip: Add these to ecosystem.config.cjs env section:');
console.log();
console.log('   env: {');
console.log('     NODE_ENV: "development",');
console.log('     EMAIL_CODE_PEPPER: "' + EMAIL_CODE_PEPPER + '",');
console.log('     JWT_SECRET: "' + JWT_SECRET + '",');
console.log('     BREVO_HOST: "smtp-relay.brevo.com",');
console.log('     BREVO_PORT: "587",');
console.log('     BREVO_USER: "your_email@example.com",');
console.log('     BREVO_PASS: "your_smtp_key",');
console.log('   }');
console.log();

// Next steps
console.log('✨ Next Steps:');
console.log('─'.repeat(70));
console.log('1. Add environment variables (choose one):');
console.log('   a) Create/update .env file with values above');
console.log('   b) Add to ecosystem.config.cjs env section');
console.log();
console.log('2. Test the setup:');
console.log('   npm run test:auth');
console.log();
console.log('3. Create test users:');
console.log('   npm run seed:users');
console.log();
console.log('4. Start dev server:');
console.log('   npm run dev');
console.log();
console.log('5. Add DevUserSwitcher to src/App.jsx:');
console.log('   import DevUserSwitcher from "./dev/DevUserSwitcher";');
console.log('   {import.meta.env.DEV && <DevUserSwitcher />}');
console.log('─'.repeat(70));
console.log();

console.log('📚 Full testing guide: TESTING_GUIDE.md\n');