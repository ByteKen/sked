import { createSign } from 'node:crypto';
import { getServiceAccountCredentials } from './firebaseAdmin.js';

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_TIMEOUT_MS = 8_000;

const cachedTokensByScope = new Map<string, { accessToken: string; expiresAtMs: number }>();

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function createServiceAccountJwt(clientEmail: string, privateKey: string, scope: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: GOOGLE_TOKEN_URI,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const unsigned = `${header}.${claimSet}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

/**
 * Exchanges the existing Firebase Admin service account JWT for a short-lived Google OAuth2
 * access token scoped strictly to `scope`, cached in memory per scope with a 60-second margin.
 */
export async function getGoogleAccessToken(
  scope: string,
): Promise<{ accessToken: string; projectId: string }> {
  const creds = getServiceAccountCredentials();
  const nowMs = Date.now();
  const cached = cachedTokensByScope.get(scope);
  if (cached && cached.expiresAtMs - 60_000 > nowMs) {
    return { accessToken: cached.accessToken, projectId: creds.projectId };
  }

  const assertion = createServiceAccountJwt(creds.clientEmail, creds.privateKey, scope);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const resp = await fetch(GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(GOOGLE_AUTH_TIMEOUT_MS),
  });

  const json = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!resp.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Failed to obtain Google OAuth2 access token (HTTP ${resp.status}).`,
    );
  }

  const ttlSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  cachedTokensByScope.set(scope, {
    accessToken: json.access_token,
    expiresAtMs: nowMs + ttlSec * 1000,
  });

  return { accessToken: json.access_token, projectId: creds.projectId };
}
