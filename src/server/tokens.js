import crypto from "node:crypto";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./config.js";

const accessTokens = new Map();
const refreshTokens = new Map();

function createToken(store, ttlMs) {
  const token = crypto.randomBytes(32).toString("base64url");
  store.set(token, Date.now() + ttlMs);
  return token;
}

function isValid(store, token) {
  if (!token) return false;
  const expiresAt = store.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    store.delete(token);
    return false;
  }
  return true;
}

export function issueTokenPair() {
  return {
    accessToken: createToken(accessTokens, ACCESS_TOKEN_TTL_MS),
    refreshToken: createToken(refreshTokens, REFRESH_TOKEN_TTL_MS),
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000)
  };
}

export function refreshAccessToken(refreshToken) {
  if (!isValid(refreshTokens, refreshToken)) return null;
  return {
    accessToken: createToken(accessTokens, ACCESS_TOKEN_TTL_MS),
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000)
  };
}

export function validateAccessToken(token) {
  return isValid(accessTokens, token);
}

export function revokeAllTokens() {
  accessTokens.clear();
  refreshTokens.clear();
}
