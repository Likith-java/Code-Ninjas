import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '../../data/dayflow.db');
const dbPath = process.env.DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
db.exec(schema);

const applied = runMigrations(db);
if (applied.length) {
  console.log(`Applied database migration(s): ${applied.join(', ')}`);
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('login_id')) {
  throw new Error(
    `Outdated database schema at ${dbPath}. Delete the file and re-run "npm run seed --prefix backend".`
  );
}
