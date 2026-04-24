/**
 * Simple in-memory rate limiter for API routes.
 * No external dependencies. Resets on server restart.
 *
 * ⚠️  WARNING — SERVERLESS LIMITATION (C2 / Sprint 1):
 * On Vercel / Lambda the limiter is PER-INSTANCE — each cold/warm function
 * instance has its own Map. A burst of N requests across N instances will
 * NOT be coalesced. Effective protection ≈ (configured limit) × (instances).
 *
 * Real protection levers right now:
 *  - Vercel platform-level DDoS shielding
 *  - PayU per-merchant velocity rules
 *  - Vendure session token (one cart per session)
 *
 * TODO [Sprint 2 / C2]: replace with Upstash Redis sliding-window limiter
 * (`@upstash/ratelimit` + `@upstash/redis`) for cross-instance counting.
 * Trigger: when we observe abuse in logs OR before public launch / paid traffic.
 * Estimate: ~2h (provision Upstash, env vars, replace function body, deploy).
 */
const MAX_ENTRIES = 10_000;
const hits = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
        if (now >= val.resetAt) hits.delete(key);
    }
}, 5 * 60 * 1000);

/**
 * Check if a request is rate limited.
 *
 * NOTE: see file-level warning — this is best-effort per-instance protection.
 * Do not rely on this as the only abuse mitigation in production.
 *
 * @returns true if the request should be BLOCKED
 */
export function isRateLimited(
    ip: string,
    route: string,
    maxRequests = 30,
    windowMs = 60_000,
): boolean {
    const key = `${ip}:${route}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
        // Evict stale entries if map is at capacity
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
    return entry.count > maxRequests;
}
