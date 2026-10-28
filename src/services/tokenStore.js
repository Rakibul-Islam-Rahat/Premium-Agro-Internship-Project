// Access token lives in memory only (never localStorage) to limit XSS exposure.
// With a real backend the refresh token is an HttpOnly cookie managed by the server.
let accessToken = null;
export const tokenStore = {
  get: () => accessToken,
  set: (t) => { accessToken = t; },
  clear: () => { accessToken = null; },
};
