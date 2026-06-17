import type { APIRoute } from "astro";
import { isRateLimitedAsync } from "@/lib/rate-limit";

/**
 * Storefront-initiated manual cancellation marker dla BLIK waiting screen.
 *
 * KONTEKST UX
 * ────────────────────────────────────────────────────────────────────────
 * Gdy user kliknie "Anuluj" w aplikacji bankowej BLIK, PayU IPN webhook
 * dochodzi do Vendure za 30s-2min, dopiero wtedy payment.state = Cancelled.
 * Przez ten czas storefront na /checkout/blik-waiting pokazuje "Czekamy na
 * potwierdzenie..." — UX wygląda jakby strona zamarła.
 *
 * Manual cancel button na BLIK waiting screen → POST tu → ACK → klient
 * redirectuje sam na /potwierdzenie?code=XXX&manualCancel=1 (failed UI bez
 * czekania na IPN). Po IPN Vendure naturally ustawi payment.state =
 * Cancelled — eventual consistency, UI już pokazał failed state.
 *
 * DLACZEGO NIE WOŁAMY VENDURE MUTATION
 * ────────────────────────────────────────────────────────────────────────
 * Vendure Shop API nie ma `cancelOrder` (admin-only) ani natywnego
 * `cancelPayment` dla customer. `transitionOrderToState("Cancelled")` z
 * PaymentAuthorized też nie przejdzie (Vendure wymaga przejść przez payment
 * state machine, a payment kontroluje PayU plugin po IPN).
 *
 * Pragmatic decision: endpoint = ACK marker. Server-side nic nie zmienia,
 * bo PayU IPN i tak zaktualizuje state w Vendure. Klient natomiast od razu
 * dostaje failed UI dzięki query param `manualCancel=1`.
 *
 * SECURITY
 * ────────────────────────────────────────────────────────────────────────
 * - Rate limit: 10 req/min/IP (rzadkie akcje human-driven, ostrzejszy niż status).
 * - Walidacja `code`: max 50 chars, regex [A-Za-z0-9_-]+ (matchuje status.ts).
 * - Brak side-effects po stronie serwera → endpoint nie potrzebuje CSRF
 *   tokena ani Vendure session auth. Worst case: bot spamuje 10 req/min
 *   i nic się nie dzieje.
 */

export const POST: APIRoute = async ({ request, url }) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (await isRateLimitedAsync(ip, "payment-cancel", 10, 60_000)) {
    return new Response(JSON.stringify({ status: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const code = url.searchParams.get("code");
  if (
    !code ||
    typeof code !== "string" ||
    code.length > 50 ||
    !/^[A-Za-z0-9_-]+$/.test(code)
  ) {
    return new Response(JSON.stringify({ status: "INVALID_CODE" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ACK only — żadnych side-effects po stronie Vendure (patrz nagłówek pliku).
  // Klient użyje tej odpowiedzi jako sygnału do redirectu na /potwierdzenie.
  return new Response(JSON.stringify({ status: "ACK", orderCode: code }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
