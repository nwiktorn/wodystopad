# WÓDYSTOPAD 2026 — strona

Sobota 21.11.2026 · 19:00 · miejsce ściśle tajne. Nie mówimy nikomu o Wódystopadzie (§1).

Strona to **jeden plik `index.html`** (HTML + CSS + JS), bez frameworków i bez budowania. Wersja D „Wódny Rave” z makiet w Figmie.

## Co gdzie jest

| Plik | Po co |
|---|---|
| `index.html` | cała strona; treści edytujesz w obiekcie `CONFIG` na początku `<script>` |
| `fonts/` | fonty hostowane lokalnie (Anton, Courier Prime, Shrikhand, Big Shoulders Display, Instrument Serif — licencja OFL, z @fontsource) |
| `favicon.svg` | ikonka-rybka w karcie przeglądarki |
| `og.jpg` | baner podglądu linku (Messenger, WhatsApp itd.), 1200×630 — po podmianie zmień `?v=` w meta `og:image`, żeby Messenger pobrał nowy |
| `apple-touch-icon.png` | ikona po dodaniu strony do ekranu głównego |
| `CNAME` | domena `wodystopad.pl` dla GitHub Pages |

## Edycja treści (`CONFIG` w `index.html`)

- `eventDate` — start imprezy (odliczanie), format `2026-11-21T19:00:00+01:00`
- `people` — Wódowicze: imię, ksywa/funkcja, „atak specjalny”, `confirmed:false` = karta wyszarzona
- `rules` — §2–§7 regulaminu (§1 jest stałym banerem), `footnote` — przypis z gwiazdką
- `program` — porządek obrad: `[godzina, punkt, rozmiar xl/l/m/s/xs/xxs]`
- `poll` — opcje ankiety „Jaka wódeczka?” z liczbą głosów startowych
- `bottles`, `guests`, `bottleMl`, `glassMl` — kalkulator butelek
- `skladeczka` — zebrano / cel / ile osób wpłaciło / ile „wyświetlone, nieodpisane” / numer BLIK / tytuł przelewu
- `sworn` — ile osób już złożyło przysięgę
- `formEndpoint` — adres z [Formspree](https://formspree.io) — wtedy przysięgi przychodzą mailem do Wódzireja (puste = tylko lokalnie)
- `counterAlwaysOn` — `true` włącza licznik rybek przed 21.11 (do testów)

Ankieta, licznik rybek i przysięga zapisują się **lokalnie w przeglądarce** (GitHub Pages jest statyczny). Wspólne, „na żywo” liczniki dla wszystkich wymagają backendu (np. Supabase) — do zrobienia, jeśli będzie potrzeba.

## Publikacja — GitHub Pages + wodystopad.pl

1. GitHub → repo `wodystopad` → **Settings → Pages** → *Build and deployment*: **Deploy from a branch**, branch **`main`**, folder **`/ (root)`** → Save.
2. W tym samym miejscu pole **Custom domain** powinno samo pokazać `wodystopad.pl` (z pliku `CNAME`). Jeśli nie — wpisz i zapisz.
3. **home.pl → Domeny → wodystopad.pl → Strefa DNS**:
   - usuń istniejące rekordy **A / AAAA** dla `wodystopad.pl` (bez subdomeny), jeśli wskazują na parking home.pl,
   - dodaj 4 rekordy **A** dla `wodystopad.pl`:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - (opcjonalnie IPv6) 4 rekordy **AAAA**: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - dodaj rekord **CNAME** dla `www` → `nwiktorn.github.io.`
4. Odczekaj na propagację DNS (zwykle 15 min – kilka godzin), wróć do **Settings → Pages** i zaznacz **Enforce HTTPS**, gdy GitHub wystawi certyfikat.

Do czasu propagacji strona działa też pod `https://nwiktorn.github.io/wodystopad/`.

## Lokalny podgląd

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

---
Strona wyłącznie dla osób pełnoletnich. Po wódeczce wracamy taksówką.

## Wspólna baza głosów (Google Sheets)

Głosy z ankiety marek, propozycje butelek, przysięgi i rybki zapisują się w arkuszu **„Wódystopad 2026 — głosy”** na Google Drive Wódzireja (zakładki `log` — surowe wpisy, `Podsumowanie` — czytelne zestawienie). Pośredniczy skrypt Google Apps Script przypięty do arkusza (kod: `tools/apps-script.gs`), wdrożony jako aplikacja internetowa („Wykonaj jako: Ja”, „Kto ma dostęp: Każdy”). Jego adres `/exec` jest w `CONFIG.api`.

- Zmiana kodu skryptu: wklej nową wersję w edytorze Apps Script → **Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa wersja → Wdróż** (adres zostaje ten sam).
- Usunięcie wpisu (np. testowego): skasuj wiersz w zakładce `log`.
- `CONFIG.api: ''` wyłącza bazę — strona wraca do zapisu tylko w przeglądarce.
