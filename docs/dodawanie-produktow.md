# Dodawanie produktow w Vendure Dashboard

Krok po kroku jak dodac nowy produkt do sklepu DbamyOPupile.pl.

## Login

1. Otworz https://vendure.jachymlabs.pl/admin
2. Login: `superadmin` / haslo otrzymane od Patryka
3. **PRZELACZ CHANNEL na `dbamyopupile`** (gora lewa, dropdown). Bez tego produkt trafi do default channel.

## 1. Utworz produkt

`Catalog > Products > + Create new product`

Pola:

| Pole              | Co wpisac                                                         |
|-------------------|-------------------------------------------------------------------|
| **Name**          | Pelna nazwa produktu (np. "Kulka do powolnego karmienia")         |
| **Slug**          | URL-friendly (np. `kulka-do-powolnego-karmienia`) — **bez spacji, polskich znakow, malymi literami** |
| **Description**   | Pelny opis HTML (rich text). Idzie do `[slug].astro` fallback.    |
| **Featured image**| Glowne zdjecie (1:1, min 800x800px, jpg/png, **wage < 200 KB**)   |
| **Assets**        | Dodatkowe zdjecia (galeria) — uploaduj wszystkie naraz            |
| **Facets**        | Opcjonalne kategorie/tagi                                         |
| **Collections**   | Dodaj do kolekcji (np. "Karmienie", "Zabawki")                    |

Zapisz: **Create**.

## 2. Stworz wariant (OBOWIAZKOWO)

Bez wariantu produkt = "Niedostepny" (brak ceny, nie ma w search).

Po zapisaniu produktu zjedz nizej do **Variants** -> **+ Add new variant**.

Pola:

| Pole               | Co wpisac                                                     |
|--------------------|---------------------------------------------------------------|
| **SKU**            | Unikalny kod (np. `DOP-KULKA-01`, `DOP-KULKA-02-NIEBIESKA`)  |
| **Price**          | **W GROSZACH** (8999 = 89.99 zl). pricesIncludeTax=true wiec to brutto |
| **Stock on hand**  | Liczba sztuk (np. 999 jesli nie trackujemy, lub realna liczba)|
| **Track inventory**| INHERIT (dziedziczy z global settings — wylaczone)            |

**Save**.

### Warianty z opcjami (np. kolory, rozmiary)

Jesli produkt ma warianty (np. "Niebieska", "Zielona"):
1. Najpierw stworz **Product options** (Catalog > Product Options): np. "Kolor"
2. Dodaj wartosci: "Niebieski", "Zielony"
3. Wroc do produktu, zaznacz tę opcje, zapisz
4. Vendure sam wygeneruje warianty per kombinacja — uzupelnij ceny i SKU dla kazdego

## 3. Reindex (po dodaniu/edycji)

`Settings > Search index > Rebuild`

Bez tego produkt nie pojawi sie w:
- Liscie produktow na stronie glownej
- Search/listing kolekcji

## 4. Sprawdz na storefront

Po reindex (~30 sek):
- https://dbamyopupile.pl/produkty/<slug> — strona produktu (fallback `[slug].astro`)
- Ew. stworz custom strone — patrz `tworzenie-stron-produktowych.md`

## Typowe bledy

| Problem                              | Przyczyna                                              | Naprawa                                                |
|--------------------------------------|--------------------------------------------------------|--------------------------------------------------------|
| "Niedostepny" mimo stocku            | Brak wariantu lub variant w wrong channel              | Stworz wariant; sprawdz czy assigned do channel        |
| Cena pokazuje sie 8999.00 zl         | Cena nie w groszach                                    | Wpisz `8999` (= 89.99 zl), nie `89.99`                 |
| Produkt nie ma w liscie kolekcji     | Brak reindex                                           | Settings > Search index > Rebuild                      |
| Strona /produkty/slug = 404          | Slug nie matchuje, albo produkt nie w channel `dbamyopupile` | Sprawdz slug + channel assignment                  |
| Zdjecie nie laduje                   | Asset za duzy / wrong format                           | Skompresuj do < 200 KB, jpg/png/webp                   |

## Checklist przed publikacja produktu

- [ ] Nazwa + slug ustawione
- [ ] Min 1 zdjecie (Featured image)
- [ ] Opis (description) wypelniony
- [ ] **Wariant utworzony** z SKU + cena (w groszach!) + stock
- [ ] Dodany do co najmniej jednej kolekcji
- [ ] Reindex zrobiony
- [ ] Sprawdzone na `dbamyopupile.pl/produkty/<slug>`
