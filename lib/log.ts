/**
 * Structured logging helpers.
 * Usage:
 *   import { log, info, warn, error, getRequestId } from "@/lib/log";
 *
 *   const requestId = getRequestId(req);
 *   info("upload-url", "Starting upload", { requestId, userId });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMeta = {
  requestId?: string;
  userId?: string;
  jobId?: string;
  subscriptionId?: string;
  stripeEventId?: string;
  planTier?: string;
  [k: string]: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function safeStringify(obj: unknown) {
  try {
    return JSON.stringify(obj);
  } catch {
    // last-resort stringify
    return String(obj);
  }
}

export function getRequestId(req?: Request | null): string {
  // Common proxy header; fall back to a random UUID
  const hdr = req?.headers?.get("x-request-id") || req?.headers?.get("x-amzn-trace-id") || "";
  if (hdr) return hdr;
  // global crypto should exist in Node 18+/Edge; guard just in case
  const anyCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function log(level: LogLevel, scope: string, message: string, meta?: LogMeta) {
  const rec = {
    ts: nowIso(),
    level,
    scope,
    msg: message,
    env: process.env.NODE_ENV || "development",
    ...meta,
  };
  const line = safeStringify(rec);

  switch (level) {
    case "debug":
      // Prefer not to spam production logs with debug unless explicitly needed
      if (process.env.NODE_ENV !== "production") {
        console.debug(line);
      }
      break;
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export function debug(scope: string, message: string, meta?: LogMeta) {
  log("debug", scope, message, meta);
}

export function info(scope: string, message: string, meta?: LogMeta) {
  log("info", scope, message, meta);
}

export function warn(scope: string, message: string, meta?: LogMeta) {
  log("warn", scope, message, meta);
}

export function error(scope: string, message: string, meta?: LogMeta & { err?: unknown }) {
  const { err, ...rest } = meta || {};
  const detail = err instanceof Error ? { name: err.name, msg: err.message, stack: err.stack } : { err };
  log("error", scope, message, { ...rest, ...detail });
}

/**
 * Helper to merge/extend log metadata.
 */
export function withMeta(base: LogMeta, extra?: LogMeta): LogMeta {
  return { ...(base || {}), ...(extra || {}) };
}