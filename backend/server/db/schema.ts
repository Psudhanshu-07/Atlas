// Schema migrations, applied atomically by the core boot sequence. Forward
// only: tables are never dropped, and existing rows survive upgrades. New
// migrations append a version here — the driver records which are applied.

/** SQL of the current schema, applied atomically by version. */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          TEXT NOT NULL,
    name           TEXT NOT NULL,
    password_hash  TEXT,
    password_salt  TEXT,
    github_id      TEXT,
    github_login   TEXT,
    avatar_url     TEXT,
    is_admin       INTEGER NOT NULL DEFAULT 0,
    bio            TEXT,
    role           TEXT,
    created_at     TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS sessions (
    id           SERIAL PRIMARY KEY,
    token_hash   TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   BIGINT NOT NULL,
    expires_at   BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    user_agent   TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS analyses (
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    analysis_id   TEXT NOT NULL,
    source        TEXT NOT NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL,
    branch        TEXT,
    analyzed_at   TEXT NOT NULL,
    files         INTEGER NOT NULL DEFAULT 0,
    lines         INTEGER NOT NULL DEFAULT 0,
    issues        INTEGER NOT NULL DEFAULT 0,
    language      TEXT,
    clusters      INTEGER,
    payload       TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS linked_repos (
    id               SERIAL PRIMARY KEY,
    owner_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source           TEXT NOT NULL,
    name             TEXT NOT NULL,
    kind             TEXT NOT NULL,
    repo_owner       TEXT,
    branch           TEXT,
    last_analyzed_at TEXT,
    created_at       TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme   TEXT NOT NULL DEFAULT 'dark',
    data    TEXT NOT NULL DEFAULT '{}'
  )`,
    `CREATE TABLE IF NOT EXISTS github_tokens (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_enc  TEXT NOT NULL,
    scopes     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS chat_conversations (
    id            SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id   TEXT,
    title         TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         TEXT,
    mode            TEXT,
    client_msg_id   TEXT,
    created_at      TEXT NOT NULL
  )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github ON users (github_id) WHERE github_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_pair ON analyses (owner_user_id, analysis_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses (owner_user_id, analyzed_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_repos_pair ON linked_repos (owner_user_id, source)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON chat_conversations (owner_user_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, id)`,
    // Retries carry the same client_msg_id, so a repeated write cannot duplicate.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client ON chat_messages (conversation_id, client_msg_id)
     WHERE client_msg_id IS NOT NULL`,
  ],
];