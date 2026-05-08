#!/usr/bin/env node

import readline from 'readline';
import { initializeDatabase, getQueries, getDatabase } from '../database/db.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (question) => new Promise((resolve) => rl.question(question, resolve));

const printHeader = () => {
  console.log('\n========================================');
  console.log('       INVITE CODE MANAGEMENT');
  console.log('========================================\n');
};

const printMenu = () => {
  console.log('1) View code analytics');
  console.log('2) Create new code');
  console.log('3) Disable active code');
  console.log('4) Exit\n');
};

const viewAnalytics = (queries) => {
  const codes = queries.getAllInviteCodes.all();

  if (codes.length === 0) {
    console.log('\nNo invite codes found.\n');
    return;
  }

  console.log('\n--- INVITE CODE ANALYTICS ---\n');
  console.log('Code'.padEnd(25) + 'Status'.padEnd(12) + 'Uses'.padEnd(8) + 'Created'.padEnd(22) + 'Description');
  console.log('-'.repeat(90));

  for (const code of codes) {
    const status = code.enabled ? 'ACTIVE' : 'inactive';
    const created = new Date(code.created_at).toLocaleString();
    const desc = code.description || '-';
    console.log(
      code.code.padEnd(25) +
      status.padEnd(12) +
      String(code.use_count).padEnd(8) +
      created.padEnd(22) +
      desc
    );
  }

  console.log('\n');

  // Summary
  const activeCode = codes.find(c => c.enabled);
  const totalUses = codes.reduce((sum, c) => sum + c.use_count, 0);

  console.log(`Total codes: ${codes.length}`);
  console.log(`Total uses: ${totalUses}`);
  console.log(`Active code: ${activeCode ? activeCode.code : 'None'}\n`);
};

const createCode = async (queries) => {
  console.log('\n--- CREATE NEW CODE ---\n');

  const code = await prompt('Enter the code you want to use: ');

  if (!code || code.trim().length === 0) {
    console.log('Code cannot be empty.\n');
    return;
  }

  const cleanCode = code.trim().toUpperCase();

  // Check if code already exists
  const existing = queries.getInviteCodeByCode.get(cleanCode);
  if (existing) {
    console.log(`Code "${cleanCode}" already exists.\n`);
    return;
  }

  const description = await prompt('Description (optional, press Enter to skip): ');
  const enableNow = await prompt('Enable now? (y/n): ');

  const shouldEnable = enableNow.toLowerCase() === 'y' || enableNow.toLowerCase() === 'yes';

  // If enabling, disable all other codes first
  if (shouldEnable) {
    queries.disableAllInviteCodes.run();
  }

  queries.createInviteCode.run(cleanCode, description.trim() || null, shouldEnable ? 1 : 0, shouldEnable ? 1 : 0);

  console.log(`\nCode "${cleanCode}" created${shouldEnable ? ' and ENABLED' : ' (not enabled yet)'}.\n`);
};

const disableActiveCode = (queries) => {
  console.log('\n--- DISABLE ACTIVE CODE ---\n');

  const activeCode = queries.getActiveInviteCode.get();

  if (!activeCode) {
    console.log('No active code to disable.\n');
    return;
  }

  queries.disableAllInviteCodes.run();
  console.log(`Disabled code: ${activeCode.code}\n`);
};

const main = async () => {
  await initializeDatabase();
  const queries = getQueries();

  printHeader();

  let running = true;

  while (running) {
    printMenu();
    const choice = await prompt('Select option (1-4): ');

    switch (choice.trim()) {
      case '1':
        viewAnalytics(queries);
        break;
      case '2':
        await createCode(queries);
        break;
      case '3':
        disableActiveCode(queries);
        break;
      case '4':
        running = false;
        console.log('\nGoodbye!\n');
        break;
      default:
        console.log('\nInvalid option. Please enter 1, 2, 3, or 4.\n');
    }
  }

  rl.close();
  process.exit(0);
};

main().catch((error) => {
  console.error('Error:', error.message);
  rl.close();
  process.exit(1);
});
