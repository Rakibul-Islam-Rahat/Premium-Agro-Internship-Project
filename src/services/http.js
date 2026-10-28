import axios from "axios";
import { env } from "../config/env.js";
import { tokenStore } from "./tokenStore.js";

export const http = axios.create({ baseURL: env.apiUrl, withCredentials: true, timeout: 20000 });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
let refreshPromise = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const config = error.config;
    const url = String(config?.url ?? "");
    const isPublicAuthRequest = ["/auth/login", "/auth/verify", "/auth/register", "/auth/password-reset/request", "/auth/password-reset/confirm"].some((path) => url.includes(path));
    const isRefreshRequest = url.includes("/auth/refresh");

    if (status === 401 && !isPublicAuthRequest && !isRefreshRequest && config && !config._retriedAfterRefresh) {
      config._retriedAfterRefresh = true;
      try {
        if (!refreshPromise) {
          refreshPromise = http.post("/auth/refresh")
            .then((response) => {
              const result = response?.data?.data ?? response?.data;
              if (!result?.accessToken) throw new Error("The session refresh did not return an access token.");
              tokenStore.set(result.accessToken);
              return result;
            })
            .finally(() => { refreshPromise = null; });
        }
        await refreshPromise;
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${tokenStore.get()}`;
        return http(config);
      } catch {
        onUnauthorized();
      }
    } else if (status === 401 && isRefreshRequest) {
      onUnauthorized();
    }

    if (error.response?.data?.message) error.message = error.response.data.message;
    return Promise.reject(error);
  },
);
