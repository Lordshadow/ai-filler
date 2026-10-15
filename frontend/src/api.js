const configuredBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

export function getApiBaseUrl() {
  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location) {
    const hostname = window.location.hostname || "127.0.0.1";
    return `http://${hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}

export const API_BASE_URL = getApiBaseUrl();

export const apiUrl = (path) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

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

export function generateCorrelationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `corr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const SENSITIVE_KEYS = ["password", "secret", "token", "csrf", "authorization", "cookie"];

function redactClientPayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactClientPayload);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      out[k] = redactClientPayload(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logClientTelemetry(event, context = {}, level = "INFO") {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    correlationId:
      context.correlationId ||
      (typeof window !== "undefined" && window.__LAST_CORRELATION_ID) ||
      generateCorrelationId(),
    context: redactClientPayload(context),
  };

  if (typeof window !== "undefined") {
    if (!Array.isArray(window.__FILLER_AI_LOGS__)) {
      window.__FILLER_AI_LOGS__ = [];
    }
    window.__FILLER_AI_LOGS__.push(entry);
    if (window.__FILLER_AI_LOGS__.length > 200) {
      window.__FILLER_AI_LOGS__.shift();
    }
  }
  return entry;
}

export function getClientTelemetryLogs() {
  if (typeof window !== "undefined" && Array.isArray(window.__FILLER_AI_LOGS__)) {
    return [...window.__FILLER_AI_LOGS__];
  }
  return [];
}

export async function authFetch(path, options = {}) {
  const url = /^https?:\/\//i.test(path) ? path : apiUrl(path);
  const headers =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : { ...(options.headers || {}) };
  const isLoginRequest = /^\/auth\/(user|admin|super)\/login$/.test(path);
  const tabSessionToken =
    !isLoginRequest && typeof window !== "undefined"
      ? window.sessionStorage?.getItem("fillerAiAccessToken")
      : null;
  if (tabSessionToken && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${tabSessionToken}`;
  }
  const method = (options.method || "GET").toUpperCase();

  const csrf = getCsrfToken();
  const hasCsrf = Object.keys(headers).some(
    (k) => k.toLowerCase() === "x-csrf-token"
  );
  if (csrf && !hasCsrf) {
    headers["X-CSRF-Token"] = csrf;
  }

  const hasCorrId = Object.keys(headers).some(
    (k) => k.toLowerCase() === "x-correlation-id"
  );
  const correlationId = hasCorrId
    ? headers[Object.keys(headers).find((k) => k.toLowerCase() === "x-correlation-id")]
    : generateCorrelationId();
  if (!hasCorrId) {
    headers["X-Correlation-ID"] = correlationId;
  }
  if (typeof window !== "undefined") {
    window.__LAST_CORRELATION_ID = correlationId;
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    );
    if (!hasContentType && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
  }

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      // Browser cookies are shared across tabs. Auth is tab-scoped through the
      // bearer token stored in sessionStorage, so never send ambient cookies.
      credentials: options.credentials || "omit",
    });
    const elapsedMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0
    );
    const serverCorrId = response.headers?.get?.("x-correlation-id") || correlationId;
    if (typeof window !== "undefined") {
      window.__LAST_CORRELATION_ID = serverCorrId;
    }
    logClientTelemetry(
      "api_request_completed",
      {
        correlationId: serverCorrId,
        method,
        path,
        status: response.status,
        durationMs: elapsedMs,
      },
      response.ok ? "INFO" : "WARNING"
    );
    return response;
  } catch (err) {
    const elapsedMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0
    );
    logClientTelemetry(
      "api_request_failed",
      {
        correlationId,
        method,
        path,
        durationMs: elapsedMs,
        error: err?.message || "Network error",
      },
      "ERROR"
    );
    throw err;
  }
}
