# Tworzenie custom stron produktowych

Kazdy produkt moze miec dwie sciezki:
1. **Fallback** — `src/pages/produkty/[slug].astro` automatycznie generuje strone z danych Vendure (zdjecia, cena, opis). Dziala od razu po dodaniu produktu w Dashboardzie.
2. **Custom** — `src/pages/produkty/<slug>.astro` — hand-craftowana strona z dedykowanymi sekcjami (zalety, FAQ, recenzje, video, "jak uzywac"). Override fallback.

Gdy chcesz miec pelna kontrole nad layoutem -> kopiuj szablon.

## Krok 1: Skopiuj szablon

```bash
cp src/pages/produkty/_szablon.astro src/pages/produkty/<slug>.astro
```

`<slug>` musi byc identyczny ze slugiem produktu w Vendure.

Przyklad:
```bash
cp src/pages/produkty/_szablon.astro src/pages/produkty/kulka-do-powolnego-karmienia.astro
```

## Krok 2: Zmien 2 linie

Otworz nowy plik i znajdz:

```ts
const PRODUCT_SLUG = 'kulka-do-powolnego-karmienia';
```

Zmien na slug swojego produktu (z Vendure Dashboard).

## Krok 3: Pisz HTML + Tailwind

Znajdz w pliku sekcje:

```astro
<!-- ============================================ -->
<!-- CUSTOM SECTIONS — TUTAJ PISZ HTML + TAILWIND  -->
<!-- ============================================ -->
```

Wszystko miedzy ta sekcja a koncem `<div class="bg-brand-canvas">` mozesz dowolnie modyfikowac.

Wszystko PRZED ta sekcja (Hero + ATC form) zostaw — to logika koszyka, Pixel, JSON-LD.

## Krok 4: Brand colors

Dostepne klasy Tailwind:

```html
<!-- Tla -->
<div class="bg-brand-canvas">    <!-- kremowe (#FAF7F2) -->
<div class="bg-brand-primary">   <!-- pastel blekit (#B8D8E8) -->
<div class="bg-brand-secondary"> <!-- granatowe (#1E3A5F) -->

<!-- Tekst -->
<p class="text-brand-text">       <!-- prawie czarny (#1A1A1A) -->
<p class="text-brand-secondary">  <!-- granat -->
<p class="text-brand-canvas">     <!-- kremowy (na ciemnym tle) -->

<!-- Kombinacje -->
<button class="bg-brand-secondary text-brand-canvas px-6 py-3 rounded-lg">CTA</button>
<span class="bg-brand-primary text-brand-text px-3 py-1 rounded-full">Badge</span>
```

CSS vars (jesli inline style):
```html
<div style="background: var(--brand-primary); color: var(--brand-text);">
```

## Przyklady sekcji do skopiowania

### Sekcja "Dlaczego ten produkt?" — 3 karty zalet

```astro
<section class="py-16 sm:py-24">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <h2 class="text-3xl sm:text-4xl font-bold text-brand-text mb-12 text-center">
      Dlaczego warto?
    </h2>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
      <div class="bg-brand-primary rounded-2xl p-6 text-center">
        <div class="text-4xl mb-3">{'\u{1F436}'}</div>
        <h3 class="font-semibold text-brand-text mb-2">Bezpieczne</h3>
        <p class="text-sm text-brand-text/80">Materialy bez BPA</p>
      </div>
      <div class="bg-brand-primary rounded-2xl p-6 text-center">
        <div class="text-4xl mb-3">{'\u{1F49A}'}</div>
        <h3 class="font-semibold text-brand-text mb-2">Polecane</h3>
        <p class="text-sm text-brand-text/80">Przez weterynarzy</p>
      </div>
      <div class="bg-brand-primary rounded-2xl p-6 text-center">
        <div class="text-4xl mb-3">{'\u{1F69A}'}</div>
        <h3 class="font-semibold text-brand-text mb-2">Z Polski</h3>
        <p class="text-sm text-brand-text/80">Wysylka 24h</p>
      </div>
    </div>
  </div>
</section>
```

### Sekcja CTA na ciemnym tle

```astro
<section class="py-16 sm:py-24 bg-brand-secondary text-brand-canvas">
  <div class="mx-auto max-w-3xl px-4 text-center">
    <h2 class="text-3xl sm:text-4xl font-bold mb-4">Sprobuj juz dzis</h2>
    <p class="text-lg mb-8 opacity-90">Twoj pupil zasluguje na to, co najlepsze.</p>
    <a href="#primary-atc-btn" class="inline-block bg-brand-canvas text-brand-secondary px-8 py-4 rounded-lg font-semibold hover:bg-white transition">
      Zamow teraz
    </a>
  </div>
</section>
```

### FAQ accordion (uses existing FAQAccordion component)

```astro
---
import FAQAccordion from '@/components/FAQAccordion';
---

<section class="py-16 bg-brand-canvas">
  <div class="mx-auto max-w-3xl px-4">
    <h2 class="text-3xl font-bold text-brand-text mb-8 text-center">FAQ</h2>
    <FAQAccordion
      client:visible
      items={[
        { q: "Czy produkt jest bezpieczny?", a: "Tak, wykonany z materialow bez BPA i metali ciezkich." },
        { q: "Jak czyscic?", a: "Mozna myc w zmywarce lub recznie ciepla woda z mydlem." },
      ]}
    />
  </div>
</section>
```

### Sekcja z video (YouTube)

```astro
<section class="py-16">
  <div class="mx-auto max-w-4xl px-4">
    <h2 class="text-3xl font-bold text-brand-text mb-8 text-center">Zobacz w akcji</h2>
    <div class="aspect-video rounded-2xl overflow-hidden">
      <iframe
        src="https://www.youtube.com/embed/VIDEO_ID"
        class="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      />
    </div>
  </div>
</section>
```

### Sekcja "Jak uzywac" — 3 kroki

```astro
<section class="py-16 sm:py-24 bg-brand-canvas">
  <div class="mx-auto max-w-7xl px-4">
    <h2 class="text-3xl sm:text-4xl font-bold text-brand-text mb-12 text-center">Jak uzywac</h2>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
      <div class="text-center">
        <div class="bg-brand-secondary text-brand-canvas w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
        <h3 class="font-semibold text-brand-text mb-2">Wsyp karme</h3>
        <p class="text-sm text-brand-text/70">Wsyp ulubiona karme do otworow</p>
      </div>
      <div class="text-center">
        <div class="bg-brand-secondary text-brand-canvas w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
        <h3 class="font-semibold text-brand-text mb-2">Daj pupilowi</h3>
        <p class="text-sm text-brand-text/70">Polóz na podlodze i obserwuj</p>
      </div>
      <div class="text-center">
        <div class="bg-brand-secondary text-brand-canvas w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
        <h3 class="font-semibold text-brand-text mb-2">Czysc po uzyciu</h3>
        <p class="text-sm text-brand-text/70">Mycie w zmywarce lub pod kranem</p>
      </div>
    </div>
  </div>
</section>
```

## Krok 5: Test lokalnie

```bash
npm run dev
```

Otworz http://localhost:4321/produkty/<slug> — sprawdz layout, ATC button, dodanie do koszyka.

## Krok 6: Push

```bash
git add src/pages/produkty/<slug>.astro
git commit -m "feat: dodaj custom strone <slug>"
git push
```

Vercel zrobi auto-deploy. Sprawdz na produkcji za ~2 min.

## Tipy

- **Sekcje przeplataj kolorami:** `bg-brand-canvas` -> `bg-brand-primary/40` -> `bg-brand-secondary` -> `bg-brand-canvas` — daje rytm strony
- **Mobile first:** zawsze testuj na 375px (iPhone SE) — uzywaj `sm:`, `lg:` modifiers
- **Kontrast:** na `bg-brand-secondary` ZAWSZE `text-brand-canvas` (nie `text-brand-text`!)
- **Kontrast 2:** na `bg-brand-primary` zostaw `text-brand-text` (granat na blekit slabo czytelne)
- **Performance:** wszystkie zdjecia inline -> `loading="lazy"` i `width`/`height` atrybuty
- **CTA:** linkuj `<a href="#primary-atc-btn">` zeby skrolowal do guzika dodaj do koszyka u gory
