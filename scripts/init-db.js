#!/usr/bin/env node

/**
 * Initializes the Turso SQLite Database schema.
 * Usage:
 *   npm run db:init
 * (Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env or environment)
 */

require('dotenv').config();
const { initDatabase } = require('../lib/turso');

async function main() {
  console.log('Connecting to Turso SQLite database...');
  console.log(`URL: ${process.env.TURSO_DATABASE_URL || '(none - using default)'}`);

  try {
    const res = await initDatabase();
    console.log(`${res.message}`);
    console.log('Table `journal_weeks` and indexes are ready to receive entries!');
  } catch (err) {
    console.error('Error initializing database:', err.message);
    process.exit(1);
  }
}

main();
