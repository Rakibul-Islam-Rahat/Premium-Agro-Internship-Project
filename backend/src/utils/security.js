import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const newId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const randomOpaqueToken = () => crypto.randomBytes(48).toString("base64url");

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.accessTokenSecret, {
    subject: user.id,
    expiresIn: env.accessTokenTtl,
    issuer: "premium-agro-api",
    audience: "premium-agro-frontend",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessTokenSecret, {
    issuer: "premium-agro-api",
    audience: "premium-agro-frontend",
  });
}

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
