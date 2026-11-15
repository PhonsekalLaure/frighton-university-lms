import { getSupabaseAdmin } from '../config/supabase.js';
import { demoBooks, demoStaff } from '../seeds/demoData.js';
import { seedDemo, unseedDemo } from '../seeds/demoSeeder.js';

const action = process.argv[2];
try {
  if (action !== 'seed' && action !== 'unseed') throw new Error('Usage: demoSeed.ts seed|unseed');
  const client = getSupabaseAdmin();
  if (action === 'seed') {
    await seedDemo(client);
    console.log('Demo seed ready: ' + demoStaff.length + ' confirmed staff accounts and ' + demoBooks.length + ' books with covers.');
    for (const staff of demoStaff) console.log(staff.role + ': ' + staff.email);
    console.log('Password for new seeded accounts: Password123!');
  } else {
    await unseedDemo(client);
    console.log('Demo cleanup complete. Only owned demo records, accounts, and covers were removed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo seed command failed.');
  console.error('Fix the reported issue, then retry the same command. See docs/demo-seeding.md for setup and recovery.');
  process.exitCode = 1;
}
