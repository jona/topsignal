import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import {
  GITHUB_CLIENT_ID,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_ACCESS_TOKEN_URL,
  GITHUB_DEVICE_SCOPE,
  AUTH_TOKEN_PATH,
  USER_AGENT,
} from "../env.js";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface TokenError {
  error: string;
  error_description?: string;
}

interface StoredAuth {
  access_token: string;
  username: string;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_DEVICE_SCOPE,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub device code request failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<DeviceCodeResponse>;
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number
): Promise<TokenResponse> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval;

  while (Date.now() < deadline) {
    await sleep(pollInterval * 1000);

    const res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const body = (await res.json()) as TokenResponse | TokenError;

    if ("access_token" in body) {
      return body;
    }

    const err = body as TokenError;
    if (err.error === "authorization_pending") continue;
    if (err.error === "slow_down") {
      pollInterval += 5;
      continue;
    }
    if (err.error === "expired_token") {
      throw new Error("Device code expired. Please try again.");
    }
    if (err.error === "access_denied") {
      throw new Error("Authorization denied by user.");
    }

    throw new Error(
      `Unexpected error: ${err.error} — ${err.error_description ?? ""}`
    );
  }

  throw new Error("Device code expired. Please try again.");
}

export function saveAuth(auth: StoredAuth): void {
  mkdirSync(dirname(AUTH_TOKEN_PATH), { recursive: true });
  writeFileSync(AUTH_TOKEN_PATH, JSON.stringify(auth, null, 2), {
    mode: 0o600,
  });
}

export function loadAuth(): StoredAuth | null {
  try {
    const raw = readFileSync(AUTH_TOKEN_PATH, "utf-8");
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed.access_token && parsed.username) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearAuth(): boolean {
  try {
    unlinkSync(AUTH_TOKEN_PATH);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
