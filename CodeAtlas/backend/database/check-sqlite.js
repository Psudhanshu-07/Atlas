const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(process.cwd(), '.codeatlas', 'codeatlas.db');
const db = new DatabaseSync(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in SQLite:', tables.map(t => t.name));

for (const t of tables) {
  if (t.name.startsWith('sqlite_')) continue;
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
  console.log(`Table ${t.name}: ${count.c} rows`);
}

