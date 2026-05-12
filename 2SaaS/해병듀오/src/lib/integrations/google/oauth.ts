import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "bizhigh_google_oauth_state";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
] as const;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleTokenEncryptionConfigured() {
  return Boolean(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim());
}

export function buildGoogleAuthorizationUrl({
  origin,
  state,
}: {
  origin: string;
  state: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID 없음");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url;
}

export function googleRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/integrations/google/oauth/callback`;
}

export function createGoogleOAuthState() {
  return randomBytes(24).toString("base64url");
}

export async function exchangeGoogleCodeForToken({
  code,
  origin,
}: {
  code: string;
  origin: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client env가 없습니다.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(origin),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google token 요청 실패 (${response.status})`);
  }
  if (!data.access_token) throw new Error("Google access_token 없음");
  return data;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client env가 없습니다.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google token 갱신 실패 (${response.status})`);
  }
  if (!data.access_token) throw new Error("Google access_token 없음");
  return data;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => ({}))) as Partial<GoogleUserInfo> & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google userinfo 요청 실패 (${response.status})`);
  }
  if (!data.sub || !data.email) throw new Error("Google 계정 정보를 확인할 수 없습니다.");
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

export async function revokeGoogleToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  return response.ok;
}

export function encryptGoogleToken(value: string) {
  const key = googleTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptGoogleToken(ciphertext: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = ciphertext.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("지원하지 않는 Google token 암호문입니다.");
  }
  const key = googleTokenEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function googleTokenEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY 없음");

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // 아래 hash fallback 사용
  }
  return createHash("sha256").update(raw).digest();
}
