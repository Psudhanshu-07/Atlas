// Stored GitHub OAuth tokens, encrypted at rest (see ./secrets). One token row
// per account.

import { row, run } from "./core";
import { encryptSecret, decryptSecret } from "./secrets";

export async function saveGithubToken(userId: number, token: string, scopes: string): Promise<void> {
  await run(
    `INSERT INTO github_tokens (user_id, token_enc, scopes, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET token_enc = excluded.token_enc, scopes = excluded.scopes,
       created_at = excluded.created_at`,
    userId,
    encryptSecret(token),
    scopes,
    new Date().toISOString(),
  );
}

export async function loadGithubToken(userId: number): Promise<{ token: string; scopes: string } | null> {
  const found = await row<{ token_enc: string; scopes: string }>(
    "SELECT token_enc, scopes FROM github_tokens WHERE user_id = ?",
    userId,
  );
  if (!found) return null;
  const token = decryptSecret(found.token_enc);
  return token ? { token, scopes: found.scopes } : null;
}

export async function deleteGithubToken(userId: number): Promise<void> {
  await run("DELETE FROM github_tokens WHERE user_id = ?", userId);
}

/** True when the stored token carries the `repo` grant (private repository access). */
export async function githubRepoAccess(userId: number): Promise<boolean> {
  const found = await row<{ scopes: string }>("SELECT scopes FROM github_tokens WHERE user_id = ?", userId);
  if (!found) return false;
  return found.scopes.split(/[,\s]+/).includes("repo");
}