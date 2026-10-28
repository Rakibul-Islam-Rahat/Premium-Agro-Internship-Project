// Vite injects import.meta.env in the browser build. The fallback also lets Node-based
// workflow tests import the same service modules without a Vite transform.
const viteEnv = import.meta.env ?? {};

export const env = {
  apiUrl: viteEnv.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1",
  // Mock mode runs the UI end-to-end without a backend. Set VITE_USE_MOCK=false when the API is ready.
  useMock: viteEnv.VITE_USE_MOCK !== "false",
};
