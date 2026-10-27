// Persistence barrel. The concrete repositories live in `db/`:
//
//   db/core.ts      connection lifecycle + bound query helpers
//   db/driver.ts    Postgres (DATABASE_URL) and embedded-PGlite drivers
//   db/schema.ts    forward-only schema migrations
//   db/secrets.ts   at-rest encryption for stored credentials
//   db/users.ts     accounts, sessions, profile, theme preference
//   db/analyses.ts  per-user analyses and linked repositories
//   db/tokens.ts    encrypted GitHub OAuth tokens
//   db/chat.ts      persistent Atlas chat history
//
// Importers keep importing "./db"; the package is the same public surface.

export * from "./db/core";
export * from "./db/driver";
export * from "./db/secrets";
export * from "./db/users";
export * from "./db/analyses";
export * from "./db/tokens";
export * from "./db/chat";