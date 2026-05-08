#!/usr/bin/env node

import { initializeDatabase, getQueries } from '../database/db.js';

const USAGE = `
Toggle tester access for a curator.

Usage:
  node server/scripts/toggleTesterFlag.js --email curator@example.com --enable
  node server/scripts/toggleTesterFlag.js --curator-id 12 --disable

Options:
  --email <email>         Email/username for the curator admin account
  --curator-id <id>       Curator ID to toggle
  --enable                Enable tester flag
  --disable               Disable tester flag
`;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    enable: null,
    email: null,
    curatorId: null
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--email':
        result.email = args[i + 1];
        i += 1;
        break;
      case '--curator-id':
        result.curatorId = Number.parseInt(args[i + 1], 10);
        i += 1;
        break;
      case '--enable':
        result.enable = true;
        break;
      case '--disable':
        result.enable = false;
        break;
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        console.log(USAGE);
        process.exit(1);
    }
  }

  if (result.enable === null) {
    console.error('Missing flag: specify --enable or --disable');
    console.log(USAGE);
    process.exit(1);
  }

  if (!result.email && !Number.isFinite(result.curatorId)) {
    console.error('Provide either --email or --curator-id');
    console.log(USAGE);
    process.exit(1);
  }

  return result;
};

const main = async () => {
  const { email, curatorId: inputCuratorId, enable } = parseArgs();
  await initializeDatabase();
  const queries = getQueries();

  let curatorId = inputCuratorId;
  let targetEmail = email;

  if (!curatorId && email) {
    const adminUser = queries.findAdminUserByUsername.get(email);
    if (!adminUser) {
      console.error(`Admin user not found for email/username: ${email}`);
      process.exit(1);
    }
    if (!adminUser.curator_id) {
      console.error(`Admin user ${email} is not linked to a curator profile`);
      process.exit(1);
    }
    curatorId = adminUser.curator_id;
    targetEmail = adminUser.username;
  }

  const curator = queries.getCuratorById.get(curatorId);
  if (!curator) {
    console.error(`Curator not found for id: ${curatorId}`);
    process.exit(1);
  }

  queries.setCuratorTester.run(enable ? 1 : 0, curatorId);

  console.log(`${enable ? 'Enabled' : 'Disabled'} tester access for curator #${curatorId} (${curator.name})${targetEmail ? ` via ${targetEmail}` : ''}`);
};

main().catch((error) => {
  console.error('Failed to toggle tester flag:', error);
  process.exit(1);
});
