// Starts a local PostgreSQL 17 server for development — no installer or Docker needed.
// Data is kept in apps/api/.pgdata between runs. Stop it with Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', '.pgdata');
const port = Number(process.env.PG_PORT || 5433);
const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  // UTF-8 regardless of the Windows locale, so ₹ and Gujarati/Hindi text can be stored.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (firstRun) {
  console.log('Initialising a new local database cluster in', dataDir);
  await pg.initialise();
}
await pg.start();
if (firstRun) {
  await pg.createDatabase('property_crm');
}
console.log(`PostgreSQL is running on port ${port} (database: property_crm). Press Ctrl+C to stop.`);

const stop = async () => {
  console.log('\nStopping PostgreSQL…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
