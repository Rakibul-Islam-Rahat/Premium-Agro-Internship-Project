import bcrypt from "bcryptjs";
import { User, RefreshSession, AuthChallenge } from "../models/index.js";
import { env } from "../config/env.js";
import { sendAuthCodeEmail } from "./email.service.js";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized, unavailable } from "../utils/errors.js";
import { newId, randomCode, randomOpaqueToken, sha256, signAccessToken, safeEqual } from "../utils/security.js";

const accessRoles = new Set(["INVESTOR", "FIELD_MGR", "ADMIN", "MAIN_ADMIN"]);
const activeAccount = (user) => user?.accountStatus === "ACTIVE" && user?.approvalStatus === "APPROVED" && !user?.deletedAt;
const otpRole = (role) => ["FIELD_MGR", "ADMIN", "MAIN_ADMIN"].includes(role) ? "EMAIL" : null;
const userDto = (user) => {
  if (!user) return null;
  const obj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete obj.passwordHash; delete obj.__v; delete obj._id;
  return obj;
};

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000,
  };
}

async function createRefreshSession(userId, res) {
  const token = randomOpaqueToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ id: newId("refresh"), userId, tokenHash: sha256(token), expiresAt, createdAt: new Date(), revokedAt: null });
  res.cookie(env.refreshCookieName, token, cookieOptions());
}

async function finishLogin(user, res) {
  await createRefreshSession(user.id, res);
  return { user: userDto(user), accessToken: signAccessToken(user) };
}

function assertSignInAllowed(user) {
  if (!user) throw unauthorized("Invalid email or password.");
  if (user.approvalStatus === "REJECTED" || user.accountStatus === "REJECTED") throw forbidden("Your registration was not approved. Please contact Premium Agro support.");
  if (user.accountStatus === "PENDING" || !["APPROVED"].includes(user.approvalStatus)) {
    const stage = user.approvalStatus === "PENDING_MAIN_ADMIN" ? "SuperAdmin approval" : "administrator review";
    throw forbidden(`Your account is awaiting ${stage}. You can sign in after all required approvals are complete.`);
  }
  if (["INACTIVE", "DEACTIVATED", "DELETED"].includes(user.accountStatus) || user.deletedAt) throw forbidden("This account is inactive. Contact an administrator for assistance.");
  if (user.accountStatus !== "ACTIVE" || user.approvalStatus !== "APPROVED") throw forbidden("This account has not completed approval.");
}

async function createChallenge(user, purpose) {
  const canLogInTerminal = env.developmentLogAuthCodes && !env.emailConfigured;
  if (!env.emailConfigured && !canLogInTerminal) {
    throw unavailable("Authentication email delivery is not configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM in backend/.env.");
  }

  const code = randomCode();
  await AuthChallenge.updateMany({ userId: user.id, purpose, usedAt: null }, { $set: { usedAt: new Date() } });
  const challenge = await AuthChallenge.create({
    id: newId("challenge"), userId: user.id, purpose, codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0, createdAt: new Date(), usedAt: null,
  });

  if (env.emailConfigured) {
    try {
      await sendAuthCodeEmail({ to: user.email, code, purpose });
    } catch (error) {
      challenge.usedAt = new Date();
      await challenge.save().catch(() => {});
      throw error;
    }
  } else {
    // Explicit local fallback only. Disable DEVELOPMENT_LOG_AUTH_CODES when email delivery is configured.
    console.info(`[DEVELOPMENT AUTH CODE] purpose=${purpose} email=${user.email} challengeId=${challenge.id} code=${code} (expires in 10 minutes)`);
  }
  return challenge;
}

export async function register(payload) {
  const name = String(payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const phone = String(payload.phone ?? "").trim();
  const role = String(payload.role ?? "INVESTOR");
  const password = String(payload.password ?? "");
  if (name.length < 2 || name.length > 100) throw badRequest("Enter a name between 2 and 100 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 180) throw badRequest("Enter a valid email address.");
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw badRequest("Enter a valid phone number.");
  if (!["INVESTOR", "FIELD_MGR", "ADMIN"].includes(role)) throw badRequest("Choose Investor, Field Manager, or Administrator. SuperAdmin accounts must be provisioned separately.");
  if (password.length < 8 || password.length > 256) throw badRequest("Password must be between 8 and 256 characters.");
  if (await User.exists({ email, accountStatus: { $ne: "DELETED" } })) throw conflict("An account with this email already exists.");

  const adminApplicant = role === "ADMIN";
  const user = await User.create({
    id: newId("u"), name, email, phone, passwordHash: await bcrypt.hash(password, 12), role,
    avatar: "", autoReinvest: false,
    profile: { fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi", address: { present: "", permanent: "", district: "", division: "" }, nominee: { name: "", relation: "Father", dob: "", nid: "", phone: "", address: "" } },
    kyc: { status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } },
    bank: { accName: name, accNum: "", bankName: "", branch: "" },
    createdAt: new Date().toISOString(), registrationFlow: true,
    accountStatus: "PENDING", approvalStatus: adminApplicant ? "PENDING_MAIN_ADMIN" : "PENDING_ADMIN",
    approval: { adminApprovedAt: null, adminApprovedBy: null, mainAdminApprovedAt: null, mainAdminApprovedBy: null },
  });
  const admins = await User.find({ role: { $in: ["ADMIN", "MAIN_ADMIN"] }, accountStatus: "ACTIVE", approvalStatus: "APPROVED" }).select("id").lean();
  const { Notification, AuditLog } = await import("../models/index.js");
  const message = adminApplicant ? `${name} applied for an Administrator account. SuperAdmin approval is required.` : `${name} registered as ${role === "FIELD_MGR" ? "Field Manager" : "Investor"}. Dual approval is required.`;
  if (admins.length) await Notification.insertMany(admins.map((admin) => ({ id: newId("n"), userId: admin.id, type: "ACCOUNT", text: message, date: new Date().toISOString(), read: false })));
  await AuditLog.create({ id: newId("audit"), actorId: user.id, actorName: user.name, action: "ACCOUNT_REGISTER", entity: user.id, detail: `${role} registration submitted; status ${user.approvalStatus}`, date: new Date().toISOString() });
  return { ok: true, approvalStage: adminApplicant ? "MAIN_ADMIN" : "ADMIN_THEN_MAIN_ADMIN" };
}

export async function login({ email: emailInput, password }, res) {
  const email = String(emailInput ?? "").trim().toLowerCase();
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(String(password ?? ""), user.passwordHash))) throw unauthorized("Invalid email or password.");
  assertSignInAllowed(user);
  const method = otpRole(user.role);
  if (method) {
    const challenge = await createChallenge(user, "LOGIN");
    return { requiresVerification: true, method, challengeId: challenge.id };
  }
  return finishLogin(user, res);
}

export async function verifyLogin({ challengeId, code }, res) {
  const challenge = await AuthChallenge.findOne({ id: String(challengeId), purpose: "LOGIN", usedAt: null, expiresAt: { $gt: new Date() } });
  if (!challenge) throw unauthorized("The verification code has expired. Sign in again to request a new code.");
  if (challenge.attempts >= 5) { challenge.usedAt = new Date(); await challenge.save(); throw unauthorized("Too many incorrect attempts. Sign in again to request a new code."); }
  challenge.attempts += 1;
  if (!safeEqual(challenge.codeHash, sha256(String(code ?? "")))) { await challenge.save(); throw unauthorized("The verification code is invalid."); }
  challenge.usedAt = new Date(); await challenge.save();
  const user = await User.findOne({ id: challenge.userId });
  assertSignInAllowed(user);
  return finishLogin(user, res);
}

export async function refreshSession(req, res) {
  const token = req.cookies?.[env.refreshCookieName];
  if (!token) throw unauthorized("Your session has expired. Sign in again.");
  const session = await RefreshSession.findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) { res.clearCookie(env.refreshCookieName, { ...cookieOptions(), maxAge: undefined }); throw unauthorized("Your refresh session has expired. Sign in again."); }
  const user = await User.findOne({ id: session.userId });
  if (!activeAccount(user)) {
    session.revokedAt = new Date(); await session.save();
    res.clearCookie(env.refreshCookieName, { ...cookieOptions(), maxAge: undefined });
    throw unauthorized("This account is inactive or has not completed approval.");
  }
  session.revokedAt = new Date(); await session.save();
  return finishLogin(user, res);
}

export async function logout(req, res) {
  const token = req.cookies?.[env.refreshCookieName];
  if (token) await RefreshSession.updateOne({ tokenHash: sha256(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
  res.clearCookie(env.refreshCookieName, { ...cookieOptions(), maxAge: undefined });
  return { ok: true };
}

export async function requestPasswordReset({ email: emailInput }) {
  if (!env.developmentLogAuthCodes) throw unavailable("Password-reset email delivery is not configured. Configure a production email provider before enabling this endpoint.");
  const email = String(emailInput ?? "").trim().toLowerCase();
  const user = await User.findOne({ email, accountStatus: { $ne: "DELETED" } });
  // Keep the browser response generic to avoid exposing whether an account exists.
  if (user) await createChallenge(user, "PASSWORD_RESET");
  return { accepted: true, message: "If the account exists, a password-reset code has been sent to the registered email address." };
}

export async function resetPassword({ email: emailInput, code, password }) {
  if (String(password ?? "").length < 8 || String(password ?? "").length > 256) throw badRequest("Password must be between 8 and 256 characters.");
  const email = String(emailInput ?? "").trim().toLowerCase();
  const user = await User.findOne({ email, accountStatus: { $ne: "DELETED" } });
  if (!user) throw unauthorized("The reset code is invalid or has expired.");
  const challenge = await AuthChallenge.findOne({ userId: user.id, purpose: "PASSWORD_RESET", usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!challenge || challenge.attempts >= 5 || !safeEqual(challenge.codeHash, sha256(String(code ?? "")))) {
    if (challenge) { challenge.attempts += 1; if (challenge.attempts >= 5) challenge.usedAt = new Date(); await challenge.save(); }
    throw unauthorized("The reset code is invalid or has expired.");
  }
  challenge.usedAt = new Date(); await challenge.save();
  user.passwordHash = await bcrypt.hash(password, 12); await user.save();
  await RefreshSession.updateMany({ userId: user.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return { ok: true };
}

export const authHelpers = { userDto, activeAccount };
