const configuredBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
export const API_BASE_URL = (configuredBase || "http://127.0.0.1:8000").replace(/\/$/, "");
export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export function getCsrfToken() {
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith("csrf_token=")) {
      let rawVal = trimmed.slice("csrf_token=".length);
      if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
        rawVal = rawVal.slice(1, -1);
      }
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

export async function authFetch(path, options = {}) {
  const url = /^https?:\/\//i.test(path) ? path : apiUrl(path);
  const headers =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : { ...(options.headers || {}) };
  const method = (options.method || "GET").toUpperCase();

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCsrfToken();
    const hasCsrf = Object.keys(headers).some(
      (k) => k.toLowerCase() === "x-csrf-token"
    );
    if (csrf && !hasCsrf) {
      headers["X-CSRF-Token"] = csrf;
    }

    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    );
    if (!hasContentType && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: options.credentials || "include",
  });
}
