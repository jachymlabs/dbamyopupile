/**
 * POST /api/survey — zapis odpowiedzi ankiety do Google Sheets.
 *
 * Forward do Google Apps Script Web App (deployed jako webhook), który
 * appenduje wiersz do arkusza. Apps Script URL z env GOOGLE_SHEETS_WEBHOOK_URL.
 *
 * Dlaczego Apps Script a nie Sheets API + Service Account:
 *   - Zero credentials JSON (tylko 1 URL w env)
 *   - Brak OAuth complexity
 *   - User: tworzy arkusz → Extensions → Apps Script → wkleja doPost → deploy
 *     as Web App ("Anyone") → kopiuje URL → wkleja do env. Koniec.
 *
 * Server-side proxy (nie client-side bezpośrednio do Apps Script) żeby:
 *   - URL nie był exposed w client bundle
 *   - CSP nie wymagał script.google.com w connect-src
 *   - same-origin CSRF guard + rate limit
 *
 * Fail-safe: jeśli webhook URL brak / Apps Script down — survey i tak pokazuje
 * kod rabatowy userowi (nie blokujemy UX z powodu problemu z zapisem).
 */

import type { APIRoute } from "astro";
import { assertSameOrigin } from "@/lib/security";
import { isRateLimitedAsync } from "@/lib/rate-limit";

export const POST: APIRoute = async ({ request }) => {
  // CSRF: same-origin only
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  // Rate limit per IP — anti-spam (max 3 ankiety / 10 min)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (await isRateLimitedAsync(ip, "survey", 3, 600_000)) {
    return new Response(
      JSON.stringify({ success: false, message: "Zbyt wiele prób. Spróbuj za chwilę." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Nieprawidłowy format." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Honeypot — bot wypełni, real user nie
  const honey = String(body._honey || "").trim();
  if (honey) {
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Sanitize odpowiedzi (5 pól). Closed-choice limit 80, feedback limit 1000.
  const audience = String(body.audience || "").trim().slice(0, 80);
  const reason = String(body.reason || "").trim().slice(0, 80);
  const outcome = String(body.outcome || "").trim().slice(0, 80);
  const objection = String(body.objection || "").trim().slice(0, 80);
  const feedback = String(body.feedback || "").trim().slice(0, 1000);
  const page = String(body.page || "").trim().slice(0, 200);

  const webhookUrl = (import.meta.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();

  // Brak webhook URL (np. jeszcze nieskonfigurowane) — nie blokuj usera,
  // zwróć success żeby kod rabatowy się pokazał. Loguj dla dev.
  if (!webhookUrl) {
    if (import.meta.env.DEV) {
      console.warn("[api/survey] GOOGLE_SHEETS_WEBHOOK_URL brak — odpowiedź NIE zapisana:", {
        audience, reason, outcome, objection, feedback, page,
      });
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward do Apps Script. Timeout 5s — Apps Script bywa wolny (~1-3s cold).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, reason, outcome, objection, feedback, page }),
      signal: controller.signal,
    });
  } catch (err) {
    // Apps Script down / timeout — nie blokuj UX, kod i tak się pokaże.
    if (import.meta.env.DEV) console.error("[api/survey] Apps Script forward failed:", err);
  } finally {
    clearTimeout(timeoutId);
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
