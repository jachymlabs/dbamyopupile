/**
 * Simple in-memory rate limiter for API routes.
 * No external dependencies. Resets on server restart.
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
