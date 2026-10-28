import { User } from "../models/index.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/security.js";

const active = (user) => user
  && user.accountStatus === "ACTIVE"
  && user.approvalStatus === "APPROVED"
  && !user.deletedAt;

export async function authRequired(req, _res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw unauthorized();
    let payload;
    try { payload = verifyAccessToken(token); } catch { throw unauthorized("Your session has expired. Sign in again."); }
    const user = await User.findOne({ id: payload.sub }).lean();
    if (!active(user)) throw unauthorized("This account is not active or has not completed approval.");
    req.user = user;
    next();
  } catch (error) { next(error); }
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden("Your role is not permitted to perform this action."));
    next();
  };
}

export const isAdmin = (user) => ["ADMIN", "MAIN_ADMIN"].includes(user?.role);
export const isSuperAdmin = (user) => user?.role === "MAIN_ADMIN";
export const ensureActive = (user) => {
  if (!active(user)) throw unauthorized("This account is not active or has not completed approval.");
};
