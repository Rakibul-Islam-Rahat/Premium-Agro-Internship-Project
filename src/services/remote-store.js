import { http } from "./http.js";
import { env } from "../config/env.js";
import { tokenStore } from "./tokenStore.js";
import { clearRemoteState, hydrateRemoteState, setRemoteCurrentUser } from "./mock/store-core.js";

const unpack = (response) => response?.data?.data ?? response?.data ?? response;
let snapshotRequest = null;
let snapshotEpoch = 0;

export function primeRemoteUser(user) {
  setRemoteCurrentUser(user);
}

export function refreshRemoteSnapshot() {
  if (snapshotRequest?.epoch === snapshotEpoch) return snapshotRequest.promise;
  const epoch = snapshotEpoch;
  const promise = (async () => {
    const response = await http.get("/app/snapshot");
    const snapshot = unpack(response);
    // A request started before logout must never repopulate the in-memory store.
    if (epoch === snapshotEpoch) hydrateRemoteState(snapshot);
    return snapshot;
  })().finally(() => {
    if (snapshotRequest?.promise === promise) snapshotRequest = null;
  });
  snapshotRequest = { epoch, promise };
  return promise;
}

export function clearRemoteSnapshot() {
  snapshotEpoch += 1;
  snapshotRequest = null;
  clearRemoteState();
}


let eventController = null;
let eventEpoch = 0;
let eventToken = null;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

export function startRemoteEvents() {
  if (env.useMock) return;
  const token = tokenStore.get();
  if (!token) return;
  if (eventController && eventToken === token) return;
  stopRemoteEvents();
  eventToken = token;
  eventController = new AbortController();
  const controller = eventController;
  const epoch = eventEpoch;

  (async () => {
    while (!controller.signal.aborted && epoch === eventEpoch) {
      try {
        const currentToken = tokenStore.get();
        if (!currentToken) return;
        const response = await fetch(`${env.apiUrl}/events`, {
          method: "GET",
          headers: { Authorization: `Bearer ${currentToken}`, Accept: "text/event-stream" },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          const refreshedResponse = await http.post("/auth/refresh");
          const refreshed = refreshedResponse?.data?.data ?? refreshedResponse?.data;
          if (!refreshed?.accessToken) throw new Error("Session refresh did not return an access token.");
          tokenStore.set(refreshed.accessToken);
          eventToken = refreshed.accessToken;
          continue;
        }
        if (!response.ok || !response.body) throw new Error(`Live update stream returned HTTP ${response.status}.`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted && epoch === eventEpoch) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            if (/^event:\s*snapshot\.changed\s*$/m.test(block)) {
              refreshRemoteSnapshot().catch((error) => {
                if (import.meta.env.DEV) console.warn("Could not refresh Premium Agro snapshot after a live-update event:", error.message);
              });
            }
          }
        }
        if (controller.signal.aborted || epoch !== eventEpoch) return;
        throw new Error("Live update stream closed; reconnecting.");
      } catch (error) {
        if (controller.signal.aborted || epoch !== eventEpoch || error?.name === "AbortError") return;
        if (import.meta.env.DEV) console.warn("Premium Agro live updates temporarily disconnected:", error.message);
        try { await sleep(3000, controller.signal); }
        catch { return; }
      }
    }
  })().catch((error) => {
    if (import.meta.env.DEV && error?.name !== "AbortError") console.warn("Premium Agro live updates stopped:", error.message);
  });
}

export function stopRemoteEvents() {
  eventEpoch += 1;
  if (eventController) eventController.abort();
  eventController = null;
  eventToken = null;
}
