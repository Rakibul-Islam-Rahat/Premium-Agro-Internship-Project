import { seed } from "./seed.js";
import { env } from "../../config/env.js";

const KEY = "agrofund.mock.db.v7";
const hasLS = typeof localStorage !== "undefined";
const load = () => { try { const raw = hasLS ? localStorage.getItem(KEY) : null; return raw ? JSON.parse(raw) : null; } catch { return null; } };
const emptyState = () => ({ users: [], projects: [], agroProjects: [], projectFundingAllocations: [], investments: [], investmentRequests: [], transactions: [], fieldLogs: [], notifications: [], audit: [], projectAllocations: [], financialEntries: [], legalDocuments: [], supportMessages: [] });

let state = env.useMock ? (load() ?? seed()) : emptyState();
// Backward-compatible migration for browser stores created before these workflows existed.
for (const key of ["users", "projects", "agroProjects", "projectFundingAllocations", "investments", "investmentRequests", "transactions", "fieldLogs", "notifications", "audit", "projectAllocations", "financialEntries", "legalDocuments", "supportMessages"]) {
  if (!Array.isArray(state[key])) state = { ...state, [key]: [] };
}
const subs = new Set();
const channel = env.useMock && typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("premium-agro-demo-state") : null;
if (channel) channel.onmessage = (event) => {
  if (event.data && typeof event.data === "object" && event.data.__premiumAgroState) {
    state = event.data.__premiumAgroState;
    subs.forEach((subscriber) => subscriber());
  }
};
if (env.useMock && typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key === KEY && event.newValue) {
    try { state = JSON.parse(event.newValue); subs.forEach((subscriber) => subscriber()); } catch { /* Ignore malformed demo data. */ }
  }
});

export const getState = () => state;
export const subscribe = (callback) => { subs.add(callback); return () => subs.delete(callback); };
const notify = () => subs.forEach((subscriber) => subscriber());

export const hydrateRemoteState = (snapshot) => {
  if (env.useMock) return state;
  state = { ...emptyState(), ...(snapshot && typeof snapshot === "object" ? snapshot : {}) };
  notify();
  return state;
};

export const setRemoteCurrentUser = (user) => {
  if (env.useMock || !user?.id) return;
  state = { ...state, users: [user, ...state.users.filter((row) => row.id !== user.id)] };
  notify();
};

export const clearRemoteState = () => {
  if (env.useMock) return;
  state = emptyState();
  notify();
};

// Browser-local writes are deliberately unavailable when the real API is enabled.
export const commit = (fn) => {
  if (!env.useMock) throw new Error("Local mock writes are disabled. Use the authenticated backend API.");
  const next = fn(state);
  if (hasLS) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw new Error("The local demo storage is full. Remove older uploaded files or connect managed file storage before continuing."); }
  }
  state = next;
  notify();
  if (channel) channel.postMessage({ __premiumAgroState: next });
};
export const resetDb = () => {
  if (!env.useMock) throw new Error("The remote database cannot be reset from the browser.");
  state = seed();
  if (hasLS) localStorage.setItem(KEY, JSON.stringify(state));
  notify();
  if (channel) channel.postMessage({ __premiumAgroState: state });
};
