/**
 * Rate limiter for API routes.
 *
 * Strategy:
 *  - PRIMARY: Upstash Redis sliding-window limiter (cross-instance, accurate).
 *    Activated when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set in env.
 *  - FALLBACK: in-memory per-instance limiter (best-effort).
 *    Used when Upstash env vars are missing (local dev, accidental misconfig).
 *
 * Public API:
 *  - `isRateLimitedAsync(ip, route, max, windowMs)` — async, preferred. Use in API routes.
 *  - `isRateLimited(ip, route, max, windowMs)` — sync, deprecated. Kept temporarily for any
 *    consumer that hasn't migrated yet. NEVER use in new code.
 *
 * Sprint 2 / C2 follow-up: completes the Sprint 1 TODO. Vercel env vars required:
 *   UPSTASH_REDIS_REST_URL  (e.g. https://eu1-xxx.upstash.io)
 *   UPSTASH_REDIS_REST_TOKEN
 * Without them the limiter degrades to in-memory mode (logged once at startup).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Config detection ────────────────────────────────────────────────

function readUpstashEnv(): { url: string; token: string } | null {
    const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
    if (!url || !token) return null;
    return { url, token };
}

let upstashRedis: Redis | null = null;
let upstashWarningLogged = false;

function getRedis(): Redis | null {
    if (upstashRedis) return upstashRedis;
    const env = readUpstashEnv();
    if (!env) {
        if (!upstashWarningLogged) {
            // Log once per process. Do NOT crash — fallback to in-memory.
            console.warn(
                '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — using per-instance in-memory limiter (NOT cross-instance accurate). Set Upstash env vars in production.'
            );
            upstashWarningLogged = true;
        }
        return null;
    }
    upstashRedis = new Redis({ url: env.url, token: env.token });
    return upstashRedis;
}

// Cache Ratelimit instances per (route, max, window) tuple — Upstash recommends reuse.
const limiters = new Map<string, Ratelimit>();

function getLimiter(route: string, max: number, windowMs: number): Ratelimit | null {
    const redis = getRedis();
    if (!redis) return null;
    const key = `${route}:${max}:${windowMs}`;
    let limiter = limiters.get(key);
    if (!limiter) {
        limiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
            prefix: `rl:${route}`,
            analytics: false,
        });
        limiters.set(key, limiter);
    }
    return limiter;
}

// ─── In-memory fallback (also kept as legacy sync API) ──────────────

const MAX_ENTRIES = 10_000;
const hits = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
        if (now >= val.resetAt) hits.delete(key);
    }
}, 5 * 60 * 1000);

function inMemoryCheck(
    ip: string,
    route: string,
    max: number,
    windowMs: number,
): boolean {
    const key = `${ip}:${route}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
        if (hits.size >= MAX_ENTRIES) {
            const keysToDelete: string[] = [];
            for (const [k, val] of hits) {
                if (now >= val.resetAt || keysToDelete.length < hits.size - MAX_ENTRIES + 100) {
                    keysToDelete.push(k);
                }
            }
            keysToDelete.forEach(k => hits.delete(k));
        }
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }

    entry.count++;
    return entry.count > max;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Check if a request should be rate-limited (async, Upstash-backed when configured).
 *
 * @returns true if the request should be BLOCKED.
 */
export async function isRateLimitedAsync(
    ip: string,
    route: string,
    maxRequests = 30,
    windowMs = 60_000,
): Promise<boolean> {
    const limiter = getLimiter(route, maxRequests, windowMs);
    if (limiter) {
        try {
            const { success } = await limiter.limit(ip);
            return !success;
        } catch (e: any) {
            // Network blip / Upstash unreachable — degrade gracefully to in-memory check
            // rather than failing open or blocking everyone.
            if (import.meta.env.DEV) {
                console.warn('[rate-limit] Upstash check failed, falling back to in-memory:', e?.message);
            }
            return inMemoryCheck(ip, route, maxRequests, windowMs);
        }
    }
    return inMemoryCheck(ip, route, maxRequests, windowMs);
}

/**
 * @deprecated Use `isRateLimitedAsync` instead. Kept for legacy callers only.
 * In-memory only; not cross-instance accurate. Returns true to BLOCK.
 */
export function isRateLimited(
    ip: string,
    route: string,
    maxRequests = 30,
    windowMs = 60_000,
): boolean {
    return inMemoryCheck(ip, route, maxRequests, windowMs);
}
