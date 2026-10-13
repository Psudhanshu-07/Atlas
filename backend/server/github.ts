// GitHub HTTP plumbing: header set, OAuth token exchange and profile fetch.
// Base URLs come from the environment so a test harness can point them at a
// stub server; production values are the GitHub defaults.

import type { Request } from "express";

const GITHUB_DOTCOM = "https://github.com";
const GITHUB_API = "https://api.github.com";

export function githubWebBase(): string {
  return (process.env.CODEATLAS_GITHUB_WEB_URL || GITHUB_DOTCOM).replace(/\/$/, "");
}

export function githubApiBase(): string {
  return (process.env.CODEATLAS_GITHUB_API_URL || GITHUB_API).replace(/\/$/, "");
}

export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CodeAtlas",
  };
}

/** Exchange an OAuth code for an access token. Throws with GitHub's message on failure. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ token: string; scopes: string }> {
  const res = await fetch(`${githubWebBase()}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || "token exchange failed");
  }
  return { token: json.access_token, scopes: json.scope ?? "" };
}

export interface GithubProfile {
  id: string;
  login: string;
  name: string;
  avatarUrl: string | null;
  email: string;
  emailVerified: boolean;
}

/** Fetch the signed-in GitHub identity, preferring a verified primary e-mail. */
export async function fetchProfile(token: string): Promise<GithubProfile> {
  const headers = githubHeaders(token);
  const res = await fetch(`${githubApiBase()}/user`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`profile request failed (HTTP ${res.status})`);
  const gh = (await res.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };

  let email = gh.email ?? "";
  let verified = false;
  try {
    const emailsRes = await fetch(`${githubApiBase()}/user/emails`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const pick =
        emails.find((e) => e.primary && e.verified) ??
        emails.find((e) => e.verified) ??
        emails.find((e) => e.primary) ??
        emails[0];
      if (pick) {
        email = pick.email;
        verified = pick.verified;
      }
    }
  } catch {
    /* the e-mail list is optional; identity works without it */
  }
  if (!email) email = `${gh.id}+${gh.login}@users.noreply.github.com`;

  return {
    id: String(gh.id),
    login: gh.login,
    name: gh.name || gh.login,
    avatarUrl: gh.avatar_url ?? null,
    email,
    emailVerified: verified,
  };
}
