/**
 * POST /api/contact — server proxy do Web3Forms (https://api.web3forms.com/submit).
 *
 * Switching z FormSubmit na Web3Forms — FormSubmit wymagał activation linka na
 * sklep@dbamyopupile.pl który nigdy nie przyszedł. Web3Forms działa od razu po
 * stworzeniu access key, bez activation flow.
 *
 * Access key linked do sklep@dbamyopupile.pl — wiadomości lecą bezpośrednio na ten
 * adres. Free tier 250/month, więcej niż starczy.
 *
 * KEY MOŻE BYĆ HARDCODED — to jest tylko form identifier (rate limit per key),
 * nie secret auth token. Public exposure jest OK per Web3Forms docs.
 */

import type { APIRoute } from "astro";
import { assertSameOrigin } from "@/lib/security";
import { isRateLimitedAsync } from "@/lib/rate-limit";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const WEB3FORMS_ACCESS_KEY = "6c6c0765-ba6e-4bb8-8eb1-f53956cc3a45";

export const POST: APIRoute = async ({ request }) => {
  // CSRF: same-origin only
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  // Rate limit per IP — anti-spam (max 5 form'sów / 5min)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (await isRateLimitedAsync(ip, "contact-form", 5, 300_000)) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Zbyt wiele prób. Spróbuj ponownie za kilka minut.",
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Nieprawidłowy format wiadomości.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate required fields
  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().slice(0, 100);
  const topic = String(body.topic || "").trim().slice(0, 120);
  const message = String(body.message || "").trim().slice(0, 2000);
  const honey = String(body._honey || "").trim();

  if (honey) {
    // Bot — pretend success, don't forward
    return new Response(
      JSON.stringify({ success: true, message: "OK" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!name || !email || !message) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Uzupełnij imię, email i wiadomość.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Nieprawidłowy format adresu email.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward to Web3Forms (server-to-server, no CORS issues)
  try {
    const web3FormsRes = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: `Nowa wiadomość z dbamyopupile.pl — ${topic || "kontakt"}`,
        from_name: name,
        replyto: email,
        name,
        email,
        topic: topic || "(brak tematu)",
        message,
      }),
    });

    const data = await web3FormsRes.json().catch(() => ({}));
    console.log("[api/contact] Web3Forms response:", web3FormsRes.status, data);

    if (web3FormsRes.ok && data.success === true) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Wiadomość wysłana. Odpowiemy w ciągu kilku godzin.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message:
          data?.message ||
          "Nie udało się wysłać wiadomości. Spróbuj ponownie albo napisz bezpośrednio na sklep@dbamyopupile.pl",
      }),
      { status: web3FormsRes.status || 500, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[api/contact] Web3Forms forward failed:", err);
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Problem z połączeniem. Napisz bezpośrednio na sklep@dbamyopupile.pl",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
