// Secret encryption for at-rest credentials (GitHub OAuth tokens). AES-256-GCM
// with a key derived from CODEATLAS_STORAGE_KEY when set (required on ephemeral
// hosts like Render, so tokens survive redeploys), or with a key stored beside
// the data directory (generated on first boot). Rotating the key invalidates
// stored tokens and users reconnect GitHub.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "../paths";

let storageKey: Buffer | null = null;

function getStorageKey(): Buffer {
  if (storageKey) return storageKey;
  const fromEnv = process.env.CODEATLAS_STORAGE_KEY?.trim();
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    storageKey = Buffer.from(fromEnv, "hex");
    return storageKey;
  }
  const file = path.join(DATA_DIR, "storage.key");
  try {
    const hex = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      storageKey = Buffer.from(hex, "hex");
      return storageKey;
    }
  } catch {
    /* generate a fresh key below */
  }
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  } catch (err) {
    console.error("[db] Could not persist the storage key; stored tokens will not survive a restart:", err);
  }
  storageKey = key;
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getStorageKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = stored.split(".");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getStorageKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null; // key rotated or row corrupted; treat as "not connected"
  }
}