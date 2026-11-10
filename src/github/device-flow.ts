import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname, join } from "node:path";
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

const AUTH_DIR = dirname(AUTH_TOKEN_PATH);
const MAX_AUTH_BYTES = 4096;
const INVALID_AUTH =
  "Saved TopSignal credentials are invalid. Run topsignal logout, then topsignal login.";

function isStoredAuth(value: unknown): value is StoredAuth {
  if (typeof value !== "object" || value === null) return false;
  const { access_token, username } = value as Partial<StoredAuth>;
  return (
    typeof access_token === "string" &&
    /^[!-~]+$/.test(access_token) &&
    typeof username === "string" &&
    /^[a-z0-9_-]+$/i.test(username)
  );
}

function isOwnedByUser(stat: Stats): boolean {
  const uid = process.getuid?.();
  return uid === undefined || stat.uid === uid;
}

function checkAuthDirectory(create = false): void {
  if (create) mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  const stat = lstatSync(AUTH_DIR);
  if (!stat.isDirectory() || !isOwnedByUser(stat)) {
    throw new Error(
      "TopSignal needs a user-owned .topsignal directory without a symlink."
    );
  }
  if (process.getuid) {
    if ((stat.mode & 0o022) !== 0) {
      throw new Error(
        "Restrict .topsignal to your account (mode 0700) and try again."
      );
    }
    if (create && (stat.mode & 0o777) !== 0o700) chmodSync(AUTH_DIR, 0o700);
  }
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
  if (!isStoredAuth(auth)) {
    throw new Error("GitHub did not return a valid TopSignal credential.");
  }
  const content = JSON.stringify({
    access_token: auth.access_token,
    username: auth.username,
  });
  if (Buffer.byteLength(content) > MAX_AUTH_BYTES) {
    throw new Error(
      "GitHub returned an unexpectedly large TopSignal credential."
    );
  }
  checkAuthDirectory(true);
  const temporary = mkdtempSync(join(AUTH_DIR, ".auth-"));
  try {
    const file = join(temporary, "auth.json");
    writeFileSync(file, content, { flag: "wx", mode: 0o600 });
    renameSync(file, AUTH_TOKEN_PATH);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function loadAuth(): StoredAuth | null {
  try {
    checkAuthDirectory();
    if (!lstatSync(AUTH_TOKEN_PATH).isFile()) throw new Error(INVALID_AUTH);
    const fd = openSync(
      AUTH_TOKEN_PATH,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        !isOwnedByUser(stat) ||
        stat.size > MAX_AUTH_BYTES
      ) {
        throw new Error(INVALID_AUTH);
      }
      if (process.getuid) {
        if ((stat.mode & 0o022) !== 0) throw new Error(INVALID_AUTH);
        if ((stat.mode & 0o777) !== 0o600) fchmodSync(fd, 0o600);
      }
      const raw = readFileSync(fd, "utf-8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(INVALID_AUTH);
      }
      if (!isStoredAuth(parsed)) throw new Error(INVALID_AUTH);
      return parsed;
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function clearAuth(): boolean {
  try {
    checkAuthDirectory();
    unlinkSync(AUTH_TOKEN_PATH);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
