import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { google } from "googleapis";

import { API_CONFIG } from "../config.js";

type GoogleOAuthClient = ReturnType<typeof createGoogleOAuthClient>;

type GoogleConnection = {
  accessToken?: string;
  expiryDate?: number;
  email: string;
  connectedAt: string;
  refreshToken: string;
};

export type GoogleAuthStatus = {
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
  authorizationUrl?: string;
};

function loadStoredConnection() {
  try {
    const raw = readFileSync(API_CONFIG.google.connectionFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<GoogleConnection>;
    if (!parsed.refreshToken || !parsed.email || !parsed.connectedAt) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      expiryDate: parsed.expiryDate,
      email: parsed.email,
      connectedAt: parsed.connectedAt,
      refreshToken: parsed.refreshToken
    } as GoogleConnection;
  } catch {
    return null;
  }
}

function persistConnection(connection: GoogleConnection | null) {
  const connectionPath = API_CONFIG.google.connectionFile;
  if (!connection) {
    try {
      rmSync(connectionPath, { force: true });
    } catch {
      return;
    }
    return;
  }

  mkdirSync(dirname(connectionPath), { recursive: true });
  writeFileSync(connectionPath, `${JSON.stringify(connection, null, 2)}\n`, "utf8");
}

class GoogleAuthStore {
  private connection: GoogleConnection | null = loadStoredConnection();

  setConnection(connection: GoogleConnection) {
    this.connection = connection;
    persistConnection(connection);
  }

  clearConnection() {
    this.connection = null;
    persistConnection(null);
  }

  getConnection() {
    return this.connection;
  }

  hasConnection() {
    return this.connection !== null;
  }
}

export const googleAuthStore = new GoogleAuthStore();

export function isGoogleOAuthConfigured() {
  return API_CONFIG.google.clientId.length > 0 && API_CONFIG.google.clientSecret.length > 0;
}

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(API_CONFIG.google.clientId, API_CONFIG.google.clientSecret, API_CONFIG.google.redirectUri);
}

export function createGoogleOAuthState() {
  return randomUUID();
}

export function getGoogleOAuthStartUrl(state: string) {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...API_CONFIG.google.scopes],
    state
  });
}

async function fetchGoogleEmail(client: GoogleOAuthClient) {
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const response = await oauth2.userinfo.get();
  return response.data.email ?? "";
}

export async function handleGoogleOAuthCallback(code: string) {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured");
  }

  const client = createGoogleOAuthClient();
  const tokenResponse = await client.getToken(code);
  const tokens = tokenResponse.tokens;

  if (!tokens.refresh_token && !googleAuthStore.getConnection()) {
    throw new Error("Google OAuth did not return a refresh token");
  }

  client.setCredentials(tokens);
  const email = await fetchGoogleEmail(client);

  googleAuthStore.setConnection({
    accessToken: tokens.access_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined,
    email,
    connectedAt: new Date().toISOString(),
    refreshToken: tokens.refresh_token ?? googleAuthStore.getConnection()!.refreshToken
  });

  return {
    email,
    connectedAt: googleAuthStore.getConnection()!.connectedAt
  };
}

export function getGoogleAuthStatus(): GoogleAuthStatus {
  if (!isGoogleOAuthConfigured()) {
    return {
      configured: false,
      connected: false
    };
  }

  const connection = googleAuthStore.getConnection();
  if (!connection) {
    return {
      configured: true,
      connected: false
    };
  }

  return {
    configured: true,
    connected: true,
    email: connection.email,
    connectedAt: connection.connectedAt
  };
}

export function clearGoogleAuth() {
  googleAuthStore.clearConnection();
}