-- Atlas PostgreSQL Schema
-- Compatible with PostgreSQL 15+ / PostgreSQL 18
-- Can be run directly via psql CLI or pgAdmin Query Tool

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  password_hash  TEXT NOT NULL DEFAULT '',
  password_salt  TEXT NOT NULL DEFAULT '',
  github_id      VARCHAR(100),
  github_login   VARCHAR(100),
  avatar_url     TEXT,
  is_admin       INTEGER NOT NULL DEFAULT 0,
  bio            TEXT,
  role           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github ON users(github_id) WHERE github_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  token_hash   VARCHAR(128) NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   BIGINT NOT NULL,
  expires_at   BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS analyses (
  id            SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  analysis_id   VARCHAR(128) NOT NULL,
  source        TEXT NOT NULL,
  name          VARCHAR(255) NOT NULL,
  kind          VARCHAR(50) NOT NULL,
  branch        VARCHAR(100),
  analyzed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  files         INTEGER NOT NULL DEFAULT 0,
  lines         INTEGER NOT NULL DEFAULT 0,
  issues        INTEGER NOT NULL DEFAULT 0,
  language      VARCHAR(50),
  clusters      INTEGER,
  payload       TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_owner_id ON analyses(owner_user_id, analysis_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses(owner_user_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS linked_repos (
  id               SERIAL PRIMARY KEY,
  owner_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  name             VARCHAR(255) NOT NULL,
  kind             VARCHAR(50) NOT NULL,
  repo_owner       VARCHAR(100),
  branch           VARCHAR(100),
  last_analyzed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, source)
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme   VARCHAR(20) NOT NULL DEFAULT 'dark',
  data    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS github_tokens (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_enc  TEXT NOT NULL,
  scopes     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id            SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_id   VARCHAR(128),
  title         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner
  ON chat_conversations(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL,
  content         TEXT NOT NULL,
  sources         TEXT,
  mode            VARCHAR(50),
  client_msg_id   VARCHAR(128),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client
  ON chat_messages(conversation_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;
