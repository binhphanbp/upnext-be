import * as dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  const res = await client.query("SELECT id, email, email_verified_at, status FROM recruiter_accounts WHERE email = 'phanductoan06@gmail.com'");
  console.log('USER_ACCOUNT:', JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
