import { env } from "@/config/env";
import { ROLE_VERIFICATION } from "@/config/roles";
import { http } from "./http";
import { MOCK_USERS, MOCK_VERIFICATION_CODE } from "./mock/users";
import { getState } from "./mock/store";
import { api } from "./api";

const SESSION_KEY = "agrofund.mock.session"; // mock mode only
const OVERRIDES_KEY = "agrofund.mock.password-overrides";
const ACCOUNTS_KEY = "agrofund.mock.accounts";
const strip = ({ password, mockPassword, ...user }) => user; // eslint-disable-line no-unused-vars
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } };
const ensureApproved = (user) => {
  if (!user) throw new Error("No account was found for this login.");
  const status = user.accountStatus ?? "ACTIVE";
  const approval = user.approvalStatus ?? "APPROVED";
  if (status === "PENDING" || !["APPROVED", "REJECTED"].includes(approval)) {
    const stage = approval === "PENDING_MAIN_ADMIN" ? "SuperAdmin approval" : "administrator review";
    throw new Error(`Your account is not active yet. It is waiting for ${stage}. You will be able to sign in after all required approvals.`);
  }
  if (approval === "REJECTED" || status === "REJECTED") throw new Error("Your registration was not approved. Please contact AgroFund support.");
  if (["INACTIVE", "DEACTIVATED", "DELETED"].includes(status)) throw new Error("This account is inactive. Contact an administrator for assistance.");
  if (status !== "ACTIVE") throw new Error("This account is not active. Contact an administrator for assistance.");
  if (approval !== "APPROVED") throw new Error("Your account has not completed approval.");
  return user;
};

const issue = (user) => {
  sessionStorage.setItem(SESSION_KEY, user.id);
  return { user: strip(user), accessToken: `mock.${user.id}.${Date.now()}` };
};

const mock = {
  async register(payload) {
    await delay(100);
    await api.registerAccount(payload);
    return { ok: true, approvalStage: payload.role === "ADMIN" ? "MAIN_ADMIN" : "ADMIN_THEN_MAIN_ADMIN" };
  },
  async login({ email, password }) {
    await delay();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const stored = getState().users.find((u) => u.email.toLowerCase() === cleanEmail);
    const builtIn = MOCK_USERS.find((u) => u.email === cleanEmail);
    const createdAccount = read(ACCOUNTS_KEY)[cleanEmail];
    const override = read(OVERRIDES_KEY)[cleanEmail];
    const expectedPassword = override ?? createdAccount?.password ?? builtIn?.password;
    if (!stored || !expectedPassword || expectedPassword !== password) throw new Error("Invalid email or password");
    const user = ensureApproved({ ...stored, role: stored.role ?? builtIn?.role });
    const method = ROLE_VERIFICATION[user.role];
    return method ? { requiresVerification: true, method, challengeId: user.id } : issue(user);
  },
  async verify({ challengeId, code }) {
    await delay();
    const stored = getState().users.find((u) => u.id === challengeId);
    if (!stored || code !== MOCK_VERIFICATION_CODE) throw new Error("Invalid verification code");
    return issue(ensureApproved(stored));
  },
  async me() {
    const id = sessionStorage.getItem(SESSION_KEY);
    const user = getState().users.find((u) => u.id === id);
    if (!user) throw new Error("No session");
    ensureApproved(user);
    return { user: strip(user), accessToken: `mock.${user.id}.${Date.now()}` };
  },
  async logout() { sessionStorage.removeItem(SESSION_KEY); },
  async requestPasswordReset({ email }) {
    await delay();
    // Demo-only reset code; production sends a single-use, expiring code by email.
    return { accepted: true, demoCode: MOCK_VERIFICATION_CODE, email: String(email ?? "").trim().toLowerCase() };
  },
  async resetPassword({ email, code, password }) {
    await delay();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (code !== MOCK_VERIFICATION_CODE) throw new Error("The reset code is invalid or has expired.");
    if (String(password ?? "").length < 8) throw new Error("Password must be at least 8 characters.");
    const exists = getState().users.some((u) => u.email.toLowerCase() === cleanEmail);
    if (!exists) throw new Error("No account was found for this email address.");
    const builtIn = MOCK_USERS.some((u) => u.email === cleanEmail);
    if (builtIn) {
      const overrides = read(OVERRIDES_KEY);
      overrides[cleanEmail] = password;
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    } else {
      const accounts = read(ACCOUNTS_KEY);
      accounts[cleanEmail] = { ...accounts[cleanEmail], password };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }
    return { ok: true };
  },
};

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
// React StrictMode can run the mount effect twice in development. Share the first
// refresh request so rotating the HttpOnly cookie cannot race against itself.
let initialRefreshPromise = null;
const remote = {
  register: (body) => http.post("/auth/register", body).then(unwrap),
  login: (body) => http.post("/auth/login", body).then(unwrap),
  verify: (body) => http.post("/auth/verify", body).then(unwrap),
  me: () => {
    if (!initialRefreshPromise) {
      initialRefreshPromise = http.post("/auth/refresh").then(unwrap).finally(() => {
        initialRefreshPromise = null;
      });
    }
    return initialRefreshPromise;
  },
  logout: () => http.post("/auth/logout").then(unwrap),
  requestPasswordReset: (body) => http.post("/auth/password-reset/request", body).then(unwrap),
  resetPassword: (body) => http.post("/auth/password-reset/confirm", body).then(unwrap),
};

export const authService = env.useMock ? mock : remote;
