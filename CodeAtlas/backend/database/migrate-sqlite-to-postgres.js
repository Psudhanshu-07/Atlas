const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const path = require('node:path');

async function migrate() {
  const sqliteDb = new DatabaseSync(path.join(process.cwd(), '.codeatlas', 'codeatlas.db'));
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Pass%40123@127.0.0.1:5432/atlas',
  });

  await pgClient.connect();
  console.log('Connected to PostgreSQL atlas database!');

  // 1. Users
  const users = sqliteDb.prepare('SELECT * FROM users').all();
  console.log(`Migrating ${users.length} users...`);
  for (const u of users) {
    await pgClient.query(
      `INSERT INTO users (id, email, name, password_hash, password_salt, github_id, github_login, avatar_url, is_admin, bio, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         password_salt = EXCLUDED.password_salt,
         github_id = EXCLUDED.github_id,
         github_login = EXCLUDED.github_login,
         avatar_url = EXCLUDED.avatar_url,
         is_admin = EXCLUDED.is_admin,
         bio = EXCLUDED.bio,
         role = EXCLUDED.role`,
      [
        u.id,
        u.email,
        u.name,
        u.password_hash || '',
        u.password_salt || '',
        u.github_id || null,
        u.github_login || null,
        u.avatar_url || null,
        u.is_admin || 0,
        u.bio || null,
        u.role || null,
        u.created_at || new Date().toISOString(),
      ]
    );
  }
  await pgClient.query(`SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`);

  // 2. Sessions
  const sessions = sqliteDb.prepare('SELECT * FROM sessions').all();
  console.log(`Migrating ${sessions.length} sessions...`);
  for (const s of sessions) {
    await pgClient.query(
      `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token_hash) DO NOTHING`,
      [s.id, s.token_hash, s.user_id, s.created_at, s.expires_at, s.last_seen_at, s.user_agent]
    );
  }
  await pgClient.query(`SELECT setval('sessions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sessions))`);

  // 3. Analyses
  const analyses = sqliteDb.prepare('SELECT * FROM analyses').all();
  console.log(`Migrating ${analyses.length} analyses...`);
  for (const a of analyses) {
    await pgClient.query(
      `INSERT INTO analyses (owner_user_id, analysis_id, source, name, kind, branch, analyzed_at, files, lines, issues, language, clusters, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (owner_user_id, analysis_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [
        a.owner_user_id,
        a.analysis_id,
        a.source,
        a.name,
        a.kind,
        a.branch || null,
        a.analyzed_at || new Date().toISOString(),
        a.files || 0,
        a.lines || 0,
        a.issues || 0,
        a.language || null,
        a.clusters || null,
        a.payload,
        a.updated_at || new Date().toISOString(),
      ]
    );
  }

  // 4. Linked Repos
  const repos = sqliteDb.prepare('SELECT * FROM linked_repos').all();
  console.log(`Migrating ${repos.length} linked_repos...`);
  for (const r of repos) {
    await pgClient.query(
      `INSERT INTO linked_repos (id, owner_user_id, source, name, kind, repo_owner, branch, last_analyzed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (owner_user_id, source) DO NOTHING`,
      [
        r.id,
        r.owner_user_id,
        r.source,
        r.name,
        r.kind,
        r.repo_owner || null,
        r.branch || null,
        r.last_analyzed_at || null,
        r.created_at || new Date().toISOString(),
      ]
    );
  }
  await pgClient.query(`SELECT setval('linked_repos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM linked_repos))`);

  // 5. Preferences
  const prefs = sqliteDb.prepare('SELECT * FROM preferences').all();
  console.log(`Migrating ${prefs.length} preferences...`);
  for (const p of prefs) {
    await pgClient.query(
      `INSERT INTO preferences (user_id, theme, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         theme = EXCLUDED.theme,
         data = EXCLUDED.data`,
      [p.user_id, p.theme || 'dark', p.data || '{}']
    );
  }

  // 6. Chat Conversations
  const convs = sqliteDb.prepare('SELECT * FROM chat_conversations').all();
  console.log(`Migrating ${convs.length} chat conversations...`);
  for (const c of convs) {
    await pgClient.query(
      `INSERT INTO chat_conversations (id, owner_user_id, analysis_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         updated_at = EXCLUDED.updated_at`,
      [c.id, c.owner_user_id, c.analysis_id || null, c.title, c.created_at, c.updated_at]
    );
  }
  await pgClient.query(`SELECT setval('chat_conversations_id_seq', (SELECT COALESCE(MAX(id), 1) FROM chat_conversations))`);

  // 7. Chat Messages
  const msgs = sqliteDb.prepare('SELECT * FROM chat_messages').all();
  console.log(`Migrating ${msgs.length} chat messages...`);
  for (const m of msgs) {
    await pgClient.query(
      `INSERT INTO chat_messages (id, conversation_id, role, content, sources, mode, client_msg_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [m.id, m.conversation_id, m.role, m.content, m.sources || null, m.mode || null, m.client_msg_id || null, m.created_at]
    );
  }
  await pgClient.query(`SELECT setval('chat_messages_id_seq', (SELECT COALESCE(MAX(id), 1) FROM chat_messages))`);

  console.log('✅ Migration to PostgreSQL completed successfully!');
  await pgClient.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

