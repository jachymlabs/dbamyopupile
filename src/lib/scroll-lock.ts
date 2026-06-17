/**
 * Body scroll lock — html overflow:hidden + iOS position:fixed fallback.
 *
 * Strategy:
 *  - Wszystkie platformy: `html { overflow: hidden }` blokuje scroll bez ruszania
 *    layoutu body — sticky elementy (PromoBar, Header) działają normalnie,
 *    brak flash przy unlock (no scroll position restoration needed).
 *  - iOS Safari dodatkowo: position:fixed + top:-Y na body bo overflow:hidden
 *    samodzielnie nie blokuje rubber-band scroll na iOS.
 *
 * Bug który próbujemy uniknąć: poprzednia implementacja position:fixed wszędzie
 * dawała "flash do top page" przy unlock + nawet drobny błąd counter accumulation
 * zostawiał body permanentnie zablokowane → sticky elementy nie działały, scroll
 * był rozjebany.
 *
 * Counter handle'uje overlapping (cart drawer + burger drawer naraz).
 */

let lockCount = 0;
let savedScrollY = 0;
let savedHtmlOverflow = "";
let savedHtmlScrollBehavior = "";

const isIOS =
  typeof navigator !== "undefined" &&
  /iP(ad|hone|od)/.test(navigator.userAgent || "");

export function lockScroll(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    const html = document.documentElement;
    savedScrollY = window.scrollY || html.scrollTop || 0;
    savedHtmlOverflow = html.style.overflow;
    savedHtmlScrollBehavior = html.style.scrollBehavior;
    html.style.overflow = "hidden";
    html.style.scrollBehavior = "auto"; // instant restore (smooth psułoby flash)

    if (isIOS) {
      const body = document.body;
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }
  }
  lockCount++;
}

export function unlockScroll(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount--;
  if (lockCount === 0) {
    const html = document.documentElement;

    if (isIOS) {
      const body = document.body;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
    }

    html.style.overflow = savedHtmlOverflow;
    html.style.scrollBehavior = savedHtmlScrollBehavior;

    if (isIOS) {
      // iOS path: scroll position need restoration po position:fixed cleanup
      window.scrollTo(0, savedScrollY);
    }
  }
}
