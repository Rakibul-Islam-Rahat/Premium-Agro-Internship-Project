import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().optional().default(""),
  ACCESS_TOKEN_SECRET: z.string().min(32).default("development-only-secret-change-before-launch-4930b81f"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  REFRESH_COOKIE_NAME: z.string().min(1).default("premium_agro_refresh"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  // Only use terminal codes locally when no email provider has been configured.
  DEVELOPMENT_LOG_AUTH_CODES: z.enum(["true", "false"]).default("true"),
  RESEND_API_KEY: z.string().trim().default(""),
  AUTH_EMAIL_FROM: z.string().trim().default(""),
  AUTH_EMAIL_REPLY_TO: z.string().trim().default(""),
  BOOTSTRAP_SUPERADMIN_NAME: z.string().default("Premium Agro SuperAdmin"),
  BOOTSTRAP_SUPERADMIN_EMAIL: z.string().default(""),
  BOOTSTRAP_SUPERADMIN_PASSWORD: z.string().default(""),
  MAX_JSON_BODY: z.string().default("8mb"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid backend environment configuration: ${details}`);
}

const hasResendApiKey = Boolean(parsed.data.RESEND_API_KEY.trim());
const hasEmailSender = Boolean(parsed.data.AUTH_EMAIL_FROM.trim());
const hasEmailReplyTo = Boolean(parsed.data.AUTH_EMAIL_REPLY_TO.trim());
if (hasResendApiKey !== hasEmailSender) {
  throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM must both be configured for email verification.");
}
if (hasEmailReplyTo && !hasResendApiKey) {
  throw new Error("AUTH_EMAIL_REPLY_TO requires RESEND_API_KEY and AUTH_EMAIL_FROM.");
}

if (parsed.data.NODE_ENV === "production") {
  if (!parsed.data.MONGODB_URI.trim()) throw new Error("MONGODB_URI is required in production.");
  if (parsed.data.ACCESS_TOKEN_SECRET === "development-only-secret-change-before-launch-4930b81f" || /replace|change-before-launch|placeholder/i.test(parsed.data.ACCESS_TOKEN_SECRET)) {
    throw new Error("ACCESS_TOKEN_SECRET must be replaced with a strong unique secret in production.");
  }
  if (parsed.data.DEVELOPMENT_LOG_AUTH_CODES === "true") {
    throw new Error("DEVELOPMENT_LOG_AUTH_CODES must be false in production; configure a delivery provider for login/reset codes.");
  }
  if (!hasResendApiKey || !hasEmailSender) {
    throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM are required in production to deliver login/reset codes.");
  }
}

export const env = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  mongoUri: parsed.data.MONGODB_URI.trim(),
  accessTokenSecret: parsed.data.ACCESS_TOKEN_SECRET,
  accessTokenTtl: parsed.data.ACCESS_TOKEN_TTL,
  refreshTokenDays: parsed.data.REFRESH_TOKEN_DAYS,
  refreshCookieName: parsed.data.REFRESH_COOKIE_NAME,
  cookieSecure: parsed.data.COOKIE_SECURE === "true" || parsed.data.NODE_ENV === "production",
  developmentLogAuthCodes: parsed.data.DEVELOPMENT_LOG_AUTH_CODES === "true" && parsed.data.NODE_ENV !== "production",
  resendApiKey: parsed.data.RESEND_API_KEY,
  authEmailFrom: parsed.data.AUTH_EMAIL_FROM,
  authEmailReplyTo: parsed.data.AUTH_EMAIL_REPLY_TO,
  emailConfigured: hasResendApiKey && hasEmailSender,
  bootstrapSuperAdminName: parsed.data.BOOTSTRAP_SUPERADMIN_NAME,
  bootstrapSuperAdminEmail: parsed.data.BOOTSTRAP_SUPERADMIN_EMAIL.trim().toLowerCase(),
  bootstrapSuperAdminPassword: parsed.data.BOOTSTRAP_SUPERADMIN_PASSWORD,
  maxJsonBody: parsed.data.MAX_JSON_BODY,
  isProduction: parsed.data.NODE_ENV === "production",
});
