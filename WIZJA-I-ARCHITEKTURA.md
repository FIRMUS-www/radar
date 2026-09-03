# Content Radar — wizja produktu i architektura techniczna

**Projekt:** Content Radar (FIRMUS) · repozytorium `FIRMUS-www/radar`
**Charakter dokumentu:** propozycja wizji i planu technicznego do dyskusji
**Data:** 2026-09-03
**Na podstawie:** `HANDOFF_CONTENT_RADAR_REDAKCYJNY.md` (dalej: „handoff") + inspekcji działającej aplikacji `zarzad-radar.vercel.app` (51 tematów, dane w Supabase, stan na 3.09.2026)

---

## Spis treści

1. [TL;DR — najważniejsze rekomendacje](#1-tldr--najważniejsze-rekomendacje)
2. [Diagnoza: co już działa, a gdzie jest największa luka](#2-diagnoza)
3. [Fundamenty handoffu, które zostają bez zmian](#3-fundamenty-które-zostają)
4. [16 ulepszeń — moja wizja na tle handoffu](#4-16-ulepszeń--moja-wizja)
5. [Architektura docelowa](#5-architektura-docelowa)
6. [Model danych](#6-model-danych)
7. [ETAP 1 — pipeline godzinowy w szczegółach](#7-etap-1--pipeline-godzinowy)
8. [ETAP 2 — warsztat redakcyjny](#8-etap-2--warsztat-redakcyjny)
9. [Uczenie się: gust, styl, anty-bańka](#9-uczenie-się)
10. [Hosting: Vercel czy seohost?](#10-hosting-vercel-czy-seohost)
11. [Koszty](#11-koszty)
12. [Roadmapa](#12-roadmapa)
13. [Ryzyka i ich ograniczanie](#13-ryzyka)
14. [KPI — instrumentacja](#14-kpi--instrumentacja)
15. [Czego świadomie NIE robimy](#15-czego-świadomie-nie-robimy)
16. [Decyzje do podjęcia](#16-decyzje-do-podjęcia)

---

# 1. TL;DR — najważniejsze rekomendacje

**Produktowo handoff jest dojrzały.** Dwuetapowość (selekcja → produkcja), taksonomia sygnałów (NEWS / PAIN / DISCOVERY / INSPIRE / INTENT), agresywne filtrowanie, format karty kandydata i jakościowe KPI — to wszystko zostaje bez zmian. Nie proponuję zmiany koncepcji. Propozycja dotyczy trzech rzeczy: **domknięcia warstwy technicznej, dodania pętli decyzji i pętli uczenia, oraz uporządkowania kosztów**.

Dziesięć najważniejszych rekomendacji:

1. **Repozytorium jako jedyne źródło prawdy.** Obecnie UI jest statyczne na Vercelu, pipeline działa gdzieś obok, dane siedzą w Supabase, a w repo jest tylko handoff. Cały system — pipeline, prompty (wersjonowane!), rejestr źródeł, UI — ma żyć w `FIRMUS-www/radar` i wdrażać się automatycznie z GitHuba.
2. **Maszyna stanów kandydata + rejestr decyzji.** Każde kliknięcie (ROZWIŃ / PÓŹNIEJ / ODRZUĆ / akceptacja / korekta z uwagą „za grzeczne") staje się zapisanym sygnałem uczącym. Bez tego uczenie stylu i gustu z sekcji 19–24 handoffu pozostaje deklaracją.
3. **Kolejka decyzji zamiast listy tematów.** Karty z trzema przyciskami, TTL zależny od typu sygnału (NEWS starzeje się w 48 h, INSPIRE może leżeć miesiąc), limit kolejki głównej ~15–20, oraz **archiwum przeszukiwalne** — tematy znikają z kolejki, ale nie z systemu.
4. **Skrzynka zasiewów (Seed Inbox).** Wklejasz link z X, z telefonu, z newslettera — Radar traktuje go jak źródło najwyższego priorytetu. To realistyczne obejście faktu, że X API jest drogie, a najlepsze sygnały społecznościowe i tak znajdujesz sam, scrollując.
5. **Rozdział modeli.** Tani model (klasa Haiku) do triażu i scoringu, mocny model (klasa Sonnet) do pisania kart i ETAP 2. Batchowanie + cache systemowych promptów + heurystyczna prefiltrowka przed LLM obniża koszt ETAP 1 kilkukrotnie.
6. **Tiering źródeł + health + yield.** Zamiast „wszystkie 64 co godzinę": HOT co godzinę, WARM co 3–4 h, COLD raz dziennie rotacyjnie. Każde źródło ma licznik rentowności (ile kandydatów → ile wybranych). Źródła muszą **zarabiać** na miejsce na liście.
7. **Telegram jako pilot redaktora.** Powiadomienie o mocnym kandydacie + decyzje przyciskami z telefonu, bez otwierania przeglądarki.
8. **Profil stylu jako żywy, czytelny dokument** + biblioteka par „propozycja → final" + lekcje wyciągane automatycznie z diffów. Zero fine-tuningu, czysty retrieval — wystarczy i jest audytowalne.
9. **Weryfikacja jako pole pierwszej klasy.** Każdy kandydat ma status faktograficzny (FAKT / PROJEKT / ZAPOWIEDŹ / OPINIA / DANE / INTERPRETACJA) widoczny na karcie; liczby w gotowcach dziedziczą źródła z briefu badawczego.
10. **Hosting: Vercel + Supabase** (kontynuacja obecnego stanu, zero utrzymania), harmonogram na start za darmo przez zewnętrzny trigger (Upstash QStash / cron-job.org), Vercel Pro dopiero gdy system się ustabilizuje. seohost zostawiamy jako realną opcję VPS (dane w PL, jedna faktura PL) — architektura jest przenośna i nie blokuje migracji.

**Szacunkowy koszt operacyjny:** ~150–400 zł/mies. na start, ~400–700 zł/mies. w wersji stabilnej (szczegóły w sekcji 11).
**Czas do pełnego systemu wg poniższej roadmapy:** 6–8 tygodni (Faza 0–3).

---

# 2. Diagnoza

## 2.1. Co już działa dobrze (potwierdzone na żywo)

- **Jakość kart jest wysoka.** Sprawdziłem działającą kolejkę: kandydaci typu „74% badanych MŚP wraca do klientów, którzy zapłacili dużo po terminie" mają dokładnie tę strukturę, którą opisuje §13 handoffu — mocny headline z liczbą, CO SIĘ STAŁO w 2–4 zdaniach, DLACZEGO WAŻNE z perspektywą małej firmy, KĄT, linki do **źródła pierwotnego i wtórnego równolegle** (np. gov.pl + media). To najtrudniejsze do zbudowania i już działa.
- **Rejestr 64 źródeł** pokrywa oficjalne, prawne, medialne, dane i organizacje — szerokość jest.
- **Dyscyplina etapów się broni:** 3/37 kandydatów z HOOK-iem i GOTOWIEM to nie wada, to dowód, że system nie pali tokenów na rozwijanie wszystkiego (§31 handoffu trafnie to interpretuje).

## 2.2. Główne luki obecnego stanu

| # | Luka | Konsekwencja |
|---|------|--------------|
| L1 | **Kod i prompty żyją poza repozytorium.** UI to statyczne pliki na Vercelu, pipeline jest niewidoczny, w repo tylko handoff. | Brak wersjonowania promptów, brak możliwości powrotu do działającej wersji, pojedynczy punkt awarii, nic nie da się przetestować przed wdrożeniem. |
| L2 | **Strona tylko wyświetla — nie zbiera decyzji.** Nie ma stanów kandydata ani rejestru wyborów. | Uczenie się gustu (§24) i stylu (§19–23) nie ma z czego czerpać; nie wiadomo, co już przeczytane; kolejka rośnie do 51 pozycji zamiast być kolejką decyzji (§14). |
| L3 | **ETAP 2 nie jest produktem.** HOOK/GOTOWIEC pojawiają się incydentalnie, a nie jako odpowiedź na moje wskazanie „ROZWIŃ TEN TEMAT". | Brak zamkniętej pętli: wybór → głęboki research → wersje draftu → korekta → lekcja. |
| L4 | **Lista bez TTL i priorytetów.** Wszystko z 72 h w jednym rzędzie. | Przeglądanie kosztuje coraz więcej; stare tematy konkurują o uwagę ze świeżymi (§27). |
| L5 | **Brak metryk.** Nie da się odpowiedzieć na pytania z §29 (jaki % kandydatów zasługuje na rozwinięcie itd.). | Nie wiadomo, czy Radar się poprawia. |
| L6 | **Brak powiadomień.** Trzeba samodzielnie otwierać stronę. | Mocne tematy czekają; „znaleziono przede mną" (scoop) traci wartość, jeśli zobaczę je wieczorem. |
| L7 | **Źródła bez telemetrii.** 64 pozycje, ale nie wiadomo, które zarabiają na swoje miejsce. | Budżet crawl i tokenów rozkłada się ślepo; lista rośnie „bezsensownie" (§33). |
| L8 | **Deduplikacja jednoznaczna tylko w obrębie przebiegu.** Kilka portali o tym samym zdarzeniu w różnych godzinach może dać kilka kart. | Łamie §11 (jeden event = jeden kandydat). |

Wniosek: **nie budujemy od zera — budujemy 2. iterację**: przenosimy to, co działa (jakość kart, źródła, dane z Supabase), do architektury, która domyka L1–L8.

---

# 3. Fundamenty, które zostają

Bez dyskusji przejmuję z handoffu jako specyfikację produktu:

1. **Dwuetapowość** (§2): szeroki research → krótka lista kandydatów → głębokie opracowanie tylko wybranych. To najważniejsza decyzja projektowa całego dokumentu i jest słuszna ekonomicznie.
2. **Taksonomia sygnałów** (§7): NEWS / PAIN / DISCOVERY / INSPIRE / INTENT, z możliwością wielokrotnego przypisania.
3. **Filtry wejściowe** (§8): „czy przedsiębiorcę to obchodzi", konkret, napięcie, zaskoczenie, przestrzeń na własny komentarz.
4. **Rubryka oceny** (§9): 8 kryteriów (relewancja, aktualność, nośność, konflikt, konkret, narracja, wiarygodność, potencjał formatu) — wchodzą jako **strukturywany scoring**, nie luźna ocena.
5. **Lista odrzuceń** (§10) — jako zamknięta lista kodów przyczyn, którą zwraca model triażu (patrz §7 poniżej); kody odrzuceń same w sobie są daną uczącą.
6. **Deduplikacja zdarzeniowa** (§11): nowy kandydat tylko przy osobnym pomyśle redakcyjnym; kolejne źródło wzbogaca istniejący kandydat.
7. **Hierarchia źródeł** (§12): źródło pierwotne > opis medialny; rozróżnienie „rząd chce" vs „obowiązuje".
8. **Format karty** (§13): HEADLINE / CO SIĘ STAŁO / DLACZEGO / POTENCJAŁ-KĄT / ŹRÓDŁO.
9. **Struktura gotowca** (§16–18): post (hook → narracja → konkret → komentarz → puenta) i rolka <60 s (hook 1–3 s → narracja mówiona → konkret → puenta → wskazówka wizualna tylko gdy pomaga).
10. **Filozofia uczenia** (§19–25): przykład „propozycja vs final" jako najlepszy sygnał; nauka też z odrzuceń; eksploracja vs eksploatacja.
11. **KPI jakościowe** (§29): sukces = „widzę coś, co chcę opublikować", nie liczba znalezionych artykułów.

---

# 4. 16 ulepszeń — moja wizja

> Kolejność od produktowych po techniczne. Przy każdym — do jakiej luki (L1–L8) i którego paragrafu handoffu się odnosi.

## U1. Repozytorium jako jedyne źródło prawdy *(→ L1)*

Struktura monorepo:

```
radar/
├── app/                  # Next.js: UI + API routes (kolejka, warsztat, admin)
│   └── app/api/
│       ├── cron/run/     # wyzwalacz pipeline'u ETAP 1 (chroń sekretem)
│       ├── decisions/    # zapis decyzji (web + Telegram)
│       ├── seeds/        # skrzynka zasiewów
│       ├── develop/      # uruchomienie ETAP 2 dla kandydata
│       └── telegram/     # webhook bota
├── pipeline/             # TypeScript, biblioteka kroków:
│   ├── adapters/         #   rss / html / api / trends / seed
│   ├── normalize.ts      #   czyszczenie URL, ekstrakcja treści
│   ├── dedup.ts          #   hash + simhash + embeddingi
│   ├── triage.ts         #   prefiltrowka heurystyczna + LLM (Haiku)
│   ├── cluster.ts        #   grupowanie na zdarzenia (pgvector)
│   ├── writer.ts         #   karty kandydatów (Sonnet)
│   └── queue.ts          #   TTL, limity, eksploracja, powiadomienia
├── prompts/              # wersjonowane prompty (triage, writer, research,
│                         # draft-post, draft-reel, lesson, retro…)
├── sources/              # rejestr źródeł: YAML z tierami i konfiguracją
├── db/                   # schemat Postgres + migracje
├── evals/                # golden set + testy regresji promptów
├── mockup/               # makiety UI (kolejka-decyzji.html)
└── docs/                 # handoff, ten dokument, decyzje architektoniczne
```

Zasady: **żaden prompt nie zmienia się bez PR**; każdy prompt ma wersję zapisywaną przy każdym wywołaniu (ślad w bazie); golden set (patrz U16) blokuje regresję jakości.

## U2. Maszyna stanów kandydata *(→ L2, L3; §14, §24)*

```
                 ┌──────────┐
   pipeline ───▶ │  QUEUE   │ (kolejka główna, TTL, max ~20)
                 └────┬─────┘
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   SELECTED        LATER         REJECTED
   (ROZWIŃ)     (snooze 24 h,   (z kodem przyczyny:
        │         score −20%)     już znam / nie mój temat /
        ▼                            nie wierzę / słabe…)
   DRAFTING ──▶ DRAFTED ──▶ ACCEPTED / EDITED ──▶ PUBLISHED
                 (wersje v1, v2…  (diff → lekcja)    │
                  + uwagi)                           ▼
                                              ARCHIVE (przeszukiwalne)
```

Każde przejście zapisuje: kto (ja), skąd (web / Telegram / karta), kiedy, z jaką uwagą. **Rejestr decyzji to paliwo całej pętli uczenia** (U10, U11).

## U3. Trzy warstwy przeglądania + TTL *(→ L4; §27)*

- **Kolejka główna:** max 15–20 aktywnych kart, posortowana score'em i świeżością; na górze pasek „dziś: 14 nowych · 3 wybrane".
- **„Może później":** odsuwane tematy wracają po 24 h z obniżonym priorytetem; widok osobną zakładką.
- **Archiwum:** wszystko, full-text + wyszukiwanie semantyczne (embeddingi). Temat, który wygasł, nie jest kandydatem, ale jest **historią** — potrzebne do sprawdzenia „czy nie robiliśmy tego 2 tygodnie temu?" i do budowania na evergreenach. (To jedyna świadoma korekta §27: znika z kolejki, nie z systemu.)

TTL domyślne wg dominującego sygnału: NEWS 48 h · PAIN 96 h · INTENT 14 dni · DISCOVERY 7 dni · INSPIRE 30 dni (lub ręcznie „evergreen").

## U4. Skrzynka zasiewów *(→ nowość; §5)*

Pole „wklej link" zawsze widoczne (web + bot Telegram: wyślij link = zasiew). Zasiew omija heurystyki źródłowe, bo już przeszedł mój wstępny filtr ludzki — trafia do triażu z maksymalną wagą i adnotacją, skąd pochodzi. **To oficjalne obejście problemu X API** i najszybszy sposób wciągnięcia mnie w pętlę: to, co znajdę samodzielnie, od razu zasila system i uczy go.

## U5. Realistyczna warstwa społecznościowa *(→ §5, §33)*

Prawda rynkowa: X API (poziom Basic) to koszt rzędu ~200 USD/mies. i przy jednym użytkowniku nie broni się ekonomicznie na start. Dlatego warstwa social w trzech krokach:

- **Faza 1:** Wykop (darmowe API, tagi: przedsiębiorcy, podatki, działalność), Reddit (wątki o JDG i podatkach — JSON API), popularne wątki z forów (forum-prawne.org, GoldenLine) + **zasiewy z X przez skrzynkę** (U4).
- **Faza 2:** Google Trends (pytrends — wychwytywanie skoków zapytań w PL), komentarze pod profilami konkurencji tam, gdzie da się legalnie.
- **Faza 3:** X API — dopiero gdy KPI pokażą, że zasiewy z X regularnie prowadzą do publikacji (wtedy zakup się broni).

## U6. Tiering źródeł + health + yield *(→ L7; §26, §33)*

- **HOT (co godzinę):** ~10–15 źródeł o najwyższej dynamice — PAP Biznes, Prawo.pl, Money.pl, RCL, Dziennik Ustaw, podatki.gov.pl, BiznesAlert…
- **WARM (co 3–4 h):** urzędy i instytucje (ZUS, KAS, PIP, UOKiK…), serwisy eksperckie, BIG/KRD, NBP.
- **COLD (1×/dzień, rotacyjnie):** organizacje, raporty, zagranica, blogi firm konkurencji.

Każde źródło ma telemetrię: `health` (czy crawl działa, kiedy ostatni sukces) i `yield` (pozycje → kandydaci → wybrane). Cotygodniowo: źródła z zerowym yieldem po okresie próbnym **degradowane lub wyłączane** (z powiadomieniem), źródła z wysokim yieldem awansowane do HOT. Model może **proponować nowe źródła** (§33), ale każda propozycja przechodzi przez mój accept i ma 14-dniowy okres próbny z raportem rentowności — koniec „bezsensownego" rozrastania listy.

Efekt uboczny: koszt i czas przebiegu spadają ~3–4× wobec płaskiego „64 źródła co godzinę", a rytm z §26 (pełny przebieg co godzinę 6:00–22:00) jest zachowany.

## U7. Deduplikacja trzywarstwowa + model zdarzeniowy *(→ L8; §11)*

1. **Dokładna:** znormalizowany URL (bez utm, www, protokołu, trailing slash) → sha256.
2. **Prawie-dokładna:** SimHash tytułu+leadu (łapie „ta sama depesza u 3 wydawców").
3. **Semantyczna:** embedding (pgvector, kosinus ≥ 0,86) do otwartych zdarzeń z ostatnich 72 h → scalenie; przedział 0,75–0,86 rozstrzyga LLM („to samo zdarzenie czy równoległy wątek?").

Jeden **event** (zdarzenie) = jeden kandydat = wiele źródeł z rolami (pierwotne / potwierdzenie / kontekst). Nowe źródło w istniejącym zdarzeniu **aktualizuje** kartę (dodaje źródło pierwotne, nową liczbę, kontrargument) i podbija jej „boost zmiany" — zamiast tworzyć duplikat, jak postuluje §11.

## U8. Rozdział modeli i dyscyplina kosztów *(→ §26)*

| Zadanie | Model | Dlaczego |
|---|---|---|
| Triaż + scoring pozycji | klasa Haiku (np. Claude Haiku) | masowa, prosta klasyfikacja; batch 15–30 pozycji na wywołanie |
| Pisanie kart kandydatów | klasa Sonnet | jakość języka w headline'ach ma znaczenie redakcyjne |
| ETAP 2: research + brief | klasa Sonnet z narzędziem web search | wiarygodne rozumowanie nad źródłami |
| ETAP 2: drafty post/rolka | klasa Sonnet (opcjonalnie wyższa klasa dla trudnych tematów) | głos i narracja |
| Lekcje stylu (diff → reguła) | klasa Sonnet | krótkie, rzadkie |
| Tygodniowy retro | klasa Haiku | agregacja |

Techniki: **prompt caching** systemowych instrukcji (czytanie z cache ~10× taniej), **batching** triażu, **heurystyczna prefiltrowka** (świeżość, waga źródła, słowniki tematów, blacklisty „kalendarium/sponsorowane") odcinająca ~50–70% pozycji **przed** LLM, budżet tokenów na przebieg z alertem przekroczenia, log kosztu każdego przebiegu w tabeli `runs`.

## U9. Weryfikacja jako pole pierwszej klasy *(→ §12)*

Na karcie kandydata obowiązkowy badge statusu faktograficznego: `FAKT` / `PROJEKT` / `ZAPOWIEDŹ` / `OPINIA` / `DANE` / `INTERPRETACJA` + poziom pewności. W ETAP 2 brief badawczy zawiera **claims z linkami** („zdanie → źródło"), a każdy numer w gotowcu musi odsyłać do claimu. Zasada twarda: **liczba bez źródła nie wchodzi do draftu.**

## U10. Profil stylu jako żywy dokument + biblioteka przykładów + lekcje *(→ §19–23)*

Trzy konkretne mechanizmy zamiast „model ma się uczyć":

1. **`style_profile.md`** — dokument utrzymywany przez model (sekcje: język / rytm / humor / emocja / narracja — dokładnie jak §21), aktualizowany po każdej akceptacji lub istotnej korekcie, wersjonowany, **czytelny i edytowalny przeze mnie**. Ja mogę coś dopisać ręcznie — to najsilniejszy sygnał.
2. **Biblioteka przykładów** — pary (propozycja modelu → wersja finalna) z tagami formatu i tematu; przy generowaniu draftu system dobiera 3–5 najlepszych par tego samego formatu jako few-shot.
3. **Lekcje** — krótkie reguły z dowodem (diff + kontekst), np. „przy danych trendowych wchodzę od najmocniejszej liczby" (dokładnie przykład z §23). Aktywnych maks. ~60, z naturalnym wygaszaniem tych, które przestają się potwierdzać.

Cel (§20): najlepszy sygnał to **różnica** między propozycją a wersją uznaną za swoją — więc diff jest obliczany zawsze i-trackingowany jako KPI (U15).

## U11. Model gustu — przejrzysty, uczony scoring *(→ §24, §9)*

Rubryka z §9 (8 kryteriów × 0–2) zostaje, ale **wagi kryteriów i preferencje tematyczne uczą się z rejestru decyzji**: prosty, interpretable model liniowy/logistyczny (żadnego czarnego pudełka). Efekt widoczny w UI: przy każdej karcie rozwijalne „dlaczego to widzisz" (składowe score'u + waga). Ja mogę ręcznie skorygować wagi. Dodatkowo: decyzja LATER nie jest odrzuceniem — to sygnał „słabsze tempo", a REJECT z kodem przyczyny (`temat-mi-nie-leży`, `już-znam`, `nie-wierzę`, `za-generyczne`) treninguje prefiltrowkę.

## U12. Kwota eksploracji + anty-dominacja *(→ §25)*

- ≥ 20% slotów kolejki głównej zarezerwowane dla kandydatów spoza utartych wzorców (oznaczone na karcie „E — eksploracja"), żeby bańka się nie zacieśniała.
- **Anty-dominacja tematyczna:** kolejka nie może składać się w > 60% z jednego typu sygnału ani jednego obszaru tematycznego (podatki nie zjadają INSPIRE i DISCOVERY).
- Co tydzień przynajmniej kilka kandydatów z COLD/nowych źródeł w kolejce — także po to, by mierzyć ich yield (U6).

## U13. Telegram jako pilot redaktora *(→ §28)*

- Powiadomienie przy kandydacie ponad próg score'u: headline + 2 zdania + **przyciski** [ROZWIŃ] [PÓŹNIEJ] [ODRZUĆ].
- Wysyłka linku do bota = zasiew (U4).
- Powiadomienie „draft gotowy" z podglądem hooka.
- Kanał awaryjny: błędy pipeline'u (3 nieudane przebiegi z rzędu → alert).

To odpowiada na §28 („otwieram stronę i w kilkadziesiąt sekund rozumiem") — często nawet bez otwierania strony.

## U14. Scoop tracking *(→ §29)*

Przy decyzji SELECTED opcjonalny tag „**już to widziałem gdzie indziej**". Dzięki temu mierzymy częstość, z jaką Radar wyprzedza moje własne kanały — jeden z najważniejszych KPI handoffu, dziś niemierzalny.

## U15. Tygodniowy raport retro + dashboard KPI *(→ L5; §29)*

Autowyliczane metryki (sekcja 14) + generowany przez AI raport tygodniowy: co wybrane/odrzucone i dlaczego, rentowność źródeł, trendy edit-distance, propozycje nowych źródeł i zakresów tematów, 3 rzeczy do poprawy. Przychodzi na Telegram w poniedziałek rano.

## U16. Golden set + wersjonowanie promptów *(→ L1)*

Zestaw ~40 historycznych kandydatów z moimi decyzjami + ~10 par „propozycja → final" draftów. Każda zmiana promptu przechodzi test regresji na golden setie (precision/recall triażu, zgodność ocen z moimi decyzjami) **przed** wdrożeniem. Koniec z „zmieniliśmy prompt i jakość spadła, nie wiadem czemu".

---

# 5. Architektura docelowa

```
                    ┌─────────────────────────────────────────────┐
                    │              GITHUB — FIRMUS-www/radar      │
                    │   kod · prompty (PR-gate) · rejestr źródeł  │
                    └──────────────────────┬──────────────────────┘
                                           │ push → auto-deploy
                                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          VERCEL — Next.js (TypeScript)                     │
│                                                                           │
│  ┌────────────┐    ┌─────────────────────────────────────────────────┐    │
│  │ SCHEDULER  │───▶│  PIPELINE ETAP 1 (serverless, idempotentny)     │    │
│  │ QStash /   │    │  1. adapters (RSS/HTML/API/trends/seed)         │    │
│  │ cron-job / │    │  2. normalize + dedup (hash/simhash/embedding)  │    │
│  │ Vercel Pro │    │  3. prefilter heuristyczny (−50–70% pozycji)    │    │
│  │ cron       │    │  4. TRIAŻ LLM (Haiku, batch, JSON)              │    │
│  │ 6:00–22:00 │    │  5. clustering zdarzeń (pgvector)               │    │
│  └────────────┘    │  6. WRITER LLM (Sonnet) → karty kandydatów      │    │
│                    │  7. kolejka: TTL · cap 20 · eksploracja 20%     │    │
│  ┌────────────┐    │  8. powiadomienia Telegram (próg score)         │    │
│  │ TELEGRAM   │◀───┴─────────────────────────────────────────────────┤    │
│  │ webhook    │  decyzje z telefonu · zasiewy · alerty               │    │
│  └─────┬──────┘                                                         │
│        │                                                                  │
│  ┌─────▼────────────────────────────────────────────────────────────┐    │
│  │ UI: KOLEJKA · WARSZTAT (ETAP 2) · ARCHIWUM · ŹRÓDŁA ·            │    │
│  │     STYL · STATYSTYKI · USTAWIENIA   (+ prosty auth 1-osobowy)   │    │
│  └─────┬────────────────────────────────────────────────────────────┘    │
│        │ ETAP 2 (na „ROZWIŃ"): deep research (Sonnet + web search)       │
│        │ → brief z claims → drafty post/rolka → self-review → wersje     │
└────────┼──────────────────────────────────────────────────────────────────┘
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     SUPABASE — Postgres + pgvector                         │
│  sources · raw_items · events · candidates · candidate_sources ·           │
│  decisions · drafts · style_profile · style_lessons · style_examples ·     │
│  published_items · runs · proposed_sources · kpi_snapshots                 │
└───────────────────────────────────────────────────────────────────────────┘
```

**Decyzje techniczne (i dlaczego):**

- **Next.js + TypeScript w jednym repo** — UI i pipeline dzielą typy i kod; deploy z GitHuba jednym kliknięciem; obecny UI na Vercelu to de facto prototyp tego samego.
- **Supabase zamiast nowej bazy** — obecne dane już tam są (ciągłość!), darmowy plan wystarcza na długo (tekst), pgvector dostępny natywnie, region UE.
- **Pipeline jako funkcja serverless wyzwalana HTTP** — Cron Vercel na planie Hobby pozwala tylko 1×/dzień, więc harmonogram godzinowy realizuje zewnętrzny trigger (Upstash QStash — darmowy do ~500 wywołań/dzień, potrzebujemy 16 — albo cron-job.org). Na Vercel Pro przechodzi się bez zmiany kodu.
- **Idempotentność i wznawialność** — przebieg dzieli się na kroki zapisujące stan; awaria w połowie nie psuje danych, a następny przebieg dokańcza. Funkcja z `maxDuration` ustawionym na 300 s; HOT tier mieści się w ~1–3 min.
- **Auth jednoosobowe** — proste: hasło z zmiennej środowiskowej + cookie session (middleware). Zero zarządzania kontami.
- **Bez vendor lock-in** — standardowy Postgres + pgvector (open source), Next.js działa wszędzie (też jako kontener Docker na VPS), zewnętrzny scheduler to zwykły POST. Migracja na seohost VPS = 1 dzień pracy, gdyby była potrzebna (sekcja 10).

---

# 6. Model danych

Schemat poglądowy (pełny DDL w `db/` przy implementacji):

```sql
-- ═══════════════ ŹRÓDŁA ═══════════════
create table sources (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,          -- 'zus', 'pap-biznes', 'wykop-podatki'
  name          text not null,
  url           text not null,
  category      text not null,   -- official | media | legal | data | org | social | foreign | competitor
  adapter       text not null,   -- rss | html | api | trends | seed
  adapter_config jsonb,          -- selektory CSS / tagi / parametry API
  tier          text not null default 'warm', -- hot | warm | cold
  active        boolean not null default true,
  trial_until   date,            -- nowe źródło: okres próbny 14 dni
  health        jsonb not null default '{}',  -- {last_ok, last_error, fail_streak}
  yield         jsonb not null default '{}',  -- {items, candidates, selected, published}
  added_by      text not null default 'user', -- user | model | seed
  notes         text,
  created_at    timestamptz not null default now()
);

-- ═══════════════ POZYCJE SUROWE ═══════════════
create table raw_items (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid references sources(id),
  run_id       uuid,
  url          text not null,
  url_norm     text not null,
  content_hash text not null,     -- sha256(url_norm) — dedup dokładny
  simhash      text,              -- dedup prawie-dokładny
  embedding    vector(1024),      -- dedup semantyczny / clustering
  title        text,
  content      text,
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  triage       jsonb,             -- {pass, reject_code, signal_types[], priority, reason}
  status       text not null default 'new'  -- new | merged | rejected | promoted
);

-- ═══════════════ ZDARZENIA (klastry) ═══════════════
create table events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  embedding  vector(1024),
  opened_at  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table event_items (
  event_id uuid references events(id),
  item_id  uuid references raw_items(id),
  role     text not null default 'context'    -- primary | confirmation | context
);

-- ═══════════════ KANDYDACI ═══════════════
create table candidates (
  id             uuid primary key default gen_random_uuid(),
  cr_id          text unique not null,        -- 'CR-260903-02' (ciągłość z obecnym systemem)
  event_id       uuid references events(id),
  headline       text not null,
  what_happened  text not null,               -- CO SIĘ STAŁO
  why_it_matters text not null,               -- DLACZEGO WAŻNE
  angles         jsonb not null default '[]', -- [{format:'rolka', text:'…'}, …]
  signal_types   text[] not null,             -- news|pain|discovery|inspire|intent
  score          jsonb not null,              -- {relevance:2, timeliness:2, …, total, weighted}
  fact_status    text not null,               -- fact|bill|announcement|opinion|data|interpretation
  confidence     text not null default 'medium',
  is_exploration boolean not null default false,
  state          text not null default 'queue',
  first_seen_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  expires_at     timestamptz not null,        -- TTL wg typu sygnału (U3)
  decided_at     timestamptz,
  model          text, prompt_version text, run_id uuid
);
create table candidate_sources (
  candidate_id uuid references candidates(id),
  url text not null, source_id uuid, role text,  -- primary | secondary
  title text, published_at timestamptz
);

-- ═══════════════ DECYZJE (paliwo uczenia) ═══════════════
create table decisions (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id),
  action       text not null,   -- select | later | reject | unselect | snooze | seen_elsewhere
  context      text not null,   -- queue | telegram | card | archive
  reject_code  text,            -- already_known | not_my_topic | dont_believe | generic | other
  note         text,            -- moje uwagi, np. „za grzeczne"
  created_at   timestamptz not null default now()
);

-- ═══════════════ DRAFTY ETAP 2 ═══════════════
create table drafts (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid references candidates(id),
  format         text not null,   -- post | reel
  version        int not null default 1,
  hook           text, body text, -- narracja (rolka) / treść (post)
  konkret        text, puenta text, visual_hint text,
  alternatives   jsonb,           -- alternatywne otwarcia
  research_brief text,            -- claims + linki z deep researchu
  status         text not null default 'draft', -- draft|accepted|edited|published
  final_text     text,            -- po mojej korekcie → para do stylu (U10)
  edit_diff      text,
  model text, prompt_version text,
  created_at     timestamptz not null default now()
);

-- ═══════════════ STYL ═══════════════
create table style_profile  (id uuid primary key default gen_random_uuid(),
                             version int not null, content text not null,
                             updated_at timestamptz default now());
create table style_lessons  (id uuid primary key default gen_random_uuid(),
                             lesson text not null, evidence jsonb,
                             active boolean default true, hits int default 0,
                             created_at timestamptz default now());
create table style_examples (id uuid primary key default gen_random_uuid(),
                             format text, proposal text, final text,
                             tags text[], quality int, created_at timestamptz default now());
create table published_items(id uuid primary key default gen_random_uuid(),
                             candidate_id uuid, final_text text,
                             platform text, url text, published_at timestamptz);

-- ═══════════════ OPERACJE ═══════════════
create table runs (             -- każdy przebieg pipeline'u
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz, finished_at timestamptz,
  sources_ok int, sources_fail int,
  items_fetched int, items_new int,
  candidates_created int, candidates_updated int,
  cost_usd numeric, errors jsonb
);
create table proposed_sources ( -- propozycje nowych źródeł od modelu
  id uuid primary key default gen_random_uuid(),
  name text, url text, rationale text, evidence jsonb,
  status text default 'pending',  -- pending | approved | rejected | trialing
  created_at timestamptz default now()
);
create table kpi_snapshots (day date primary key,
  shown int, selected int, rejected int, later int,
  drafted int, accepted int, published int,
  avg_edit_distance numeric, scoops int, cost_usd numeric);
```

---

# 7. ETAP 1 — pipeline godzinowy

Jeden przebieg (co godzinę, 6:00–22:00) wygląda tak:

### Krok 1 — Fetch (adaptery)
Dla źródeł, których kolej nadeszła w tym przebiegu (wg tieru): RSS → parse; strony HTML → konfigurowalne selektory (lista pozycji) + ekstrakcja treści; API (Wykop, Reddit, GUS) → natywne wywołania; trends → porównanie z wykresem z 7 dni; **seed inbox** → pozycje ze skrzynki. Retry 2×, user-agent identyfikujący (`ContentRadarBot/1.0`), respektowanie robots.txt przy HTML.

### Krok 2 — Normalize + dedup wstępny
Czyszczenie URL (utm, fbclid, www, protokół, trailing slash), ekstrakcja treści z HTML, `content_hash` = sha256(url_norm). Pozycje już widziane → pomijane bez LLM.

### Krok 3 — Prefilter heurystyczny (bez LLM)
Tanie reguły: świeżość (≤ 48 h dla NEWS-źródeł), waga źródła, słownik pozytywny (ryczałt, KSeF, upadłość, ZUS, JDG, składka, sankcje, VAT, mikropodmiot…), blacklisty („kalendarium", „partner materiału", ogłoszenia o przetargach…), długość treści. Cel: **odciąć 50–70% pozycji przed LLM**.

### Krok 4 — Triaż LLM (klasa Haiku, batch, JSON)
Batch po 15–25 pozycji. Prompt zawiera: definicje 5 sygnałów (§7 handoffu), 5 pytań filtra (§8), listę kodów odrzuceń (§10). Wyjście JSON per pozycja:

```json
{
  "pass": true,
  "reject_code": null,
  "signal_types": ["news", "pain"],
  "why_relevant": "nowy obowiązek fakturowy dla usług IT",
  "priority": 4,
  "has_concrete": true
}
```

### Krok 5 — Clustering zdarzeń
Embedding pozycji → kosinus ≥ 0,86 do otwartych zdarzeń (72 h) → scalenie; 0,75–0,86 → pytanie do LLM o tożsamość zdarzenia; poniżej → nowe zdarzenie.

### Krok 6 — Writer LLM (klasa Sonnet)
Dla nowych zdarzeń — karta dokładnie wg §13 handoffu + scoring wg §9 (8 kryteriów × 0–2, wagi z U11) + `fact_status` + 1–3 kąty. Dla istniejących — **aktualizacja** (nowe źródło/liczba/kontrargument → boost). Limit: **max 3–6 nowych kandydatów na przebieg** (ochrona przed zalaniem).

Szkic promptu (skrót):

> Jesteś researcherem redakcji Content Radar dla przedsiębiorców i JDG. Dla zdarzenia poniżej zwróć JSON: headline (jedno zdanie z najmocniejszym konkretem — liczba, zmiana, konflikt lub zaskoczenie; bez clickbaitu), what_happened (2–4 zdania faktów, zero komentarza), why_it_matters (perspektywa małej firmy), angles (1–3, każdy z formatem), score (rubryka 8×0–2 + uzasadnienie jednolinijkowe), fact_status, confidence. Zasady: nie przekręcaj liczb; rozróżniaj „projekt/zapowiedź" od „obowiązuje"; jeżeli nie ma konkretnego zaczepienia — zwróć pass=false.

### Krok 7 — Zarządzanie kolejką
TTL (U3), cap 20, ≥ 20% eksploracji (U12), anty-dominacja tematyczna, snooze przy LATER, przywracanie evergreen.

### Krok 8 — Powiadomienia
Kandydat ponad próg score (albo z boostem zmiany w śledzonym zdarzeniu) → Telegram (U13).

---

# 8. ETAP 2 — warsztat redakcyjny

Uruchamiany przyciskiem **ROZWIŃ TEN TEMAT** (web lub Telegram). Przebieg:

1. **Deep research** (klasa Sonnet + web search + fetch źródeł): przeczytaj źródło pierwotne w całości; znajdź inne źródła tego zdarzenia; sprawdź liczby i daty; ustal co naprawdę nowe; znajdź kontrargument. Wynik: **brief badawczy** — lista claimsów z linkami, kontekst, zidentyfikowany konflikt, ocena ryzyka faktograficznego. (Checklista = pkt 1–9 z §15 handoffu.)
2. **Draft posta** (§17): hook / narracja / konkret / mój komentarz / puenta / 1–2 alternatywne otwarcia; długość wynika z tematu. Kontekst generowania: brief + profil stylu + 3–5 najlepszych par przykładów tego formatu + aktywne lekcje + moje uwagi do poprzedniej wersji.
3. **Draft rolki** (§18): hook 1–3 s, narracja mówiona < 60 s (~130–150 słów), konkret wcześnie, puenta-zamyślenie, wskazówka wizualna tylko gdy realnie pomaga.
4. **Self-review**: automatyczna kontrola — czy hook zatrzymuje? czy konkret jest wcześnie? czy każda liczba ma źródło z briefu? czy nie ma fraz z listy „brzmi jak AI" (lista prowadzona w profilu stylu)? Niespójności → poprawka przed pokazaniem.
5. **Wersje i diff**: v1, v2… — każdą korektę widzę jako diff; przy akceptacji zapisuję parę (propozycja → final) do biblioteki przykładów i generuję **lekcję**, gdy diff jest istotny (U10).
6. **Po publikacji**: `published_items` — baza do wyszukiwania „czy już o tym pisałem" + materiał treningowy.

Czas od kliknięcia ROZWIŃ do gotowca: cel < 15 minut (asynchronicznie; przychodzi powiadomienie).

---

# 9. Uczenie się

## 9.1. Gust (ETAP 1)
- **Sygnały:** decisions (select/later/reject z kodem), w tym oznaczenie `seen_elsewhere`.
- **Mechanizm:** rubryka 8×0–2 z uczonymi wagami (prosta regresja logistyczna, interpretowalna; przeliczana co noc na skumulowanych decyzjach). Cold start: pierwsze 2 tygodnie wagi neutralne — system zbiera dane.
- **Przegląd:** wagi i top-motywacje widoczne w UI („dlaczego to widzisz"); ręczna korekta możliwa; tygodniowy retro pokazuje, co system wywnioskował z moich decyzji (§24: „regularnie nie wybieram miękkich poradników → priorytet w dół").

## 9.2. Styl (ETAP 2)
Mechanizmy U10 (profil + przykłady + lekcje) + KPI edit distance (jak mało poprawiam) + lista zakazanych fraz. **Bez fine-tuningu własnych modeli** — retrieval par jest tańszy, audytowalny i aktualizowany w minutę, a nie tygodnie.

## 9.3. Źródła
Yield = wybrane kandydaty / pozycje (i drugi poziom: opublikowane / wybrane). Degradacja/awans tierów, propozycje nowych źródeł z 14-dniowym trialem i raportem (U6).

## 9.4. Anty-bańka
Kwota eksploracji 20% + anty-dominacja + wymóg obecności źródeł COLD w kolejce (U12). Eksploracyjne kandydaty są tagowane — dzięki temu wiem, które trafienia przyszły spoza schematu i mogę celowo nagradzać zaskoczenie (§25).

---

# 10. Hosting: Vercel czy seohost?

| Kryterium | **Vercel + Supabase** (rekomendacja) | seohost — hosting współdzielony | seohost — VPS |
|---|---|---|---|
| Deploy z GitHuba (PR → preview → prod) | ✅ natywnie | ❌ ręcznie/przez panel | ⚠️ do zbudowania (webhook + skrypt) |
| Harmonogram godzinowy (6:00–22:00) | ✅ zewnętrzny trigger za $0 lub Vercel Pro | ⚠️ cron panelu (jakość różna) | ✅ systemowy cron |
| Uruchomienie pipeline'u AI (długie zadania) | ✅ serverless, skalowanie zero-ops | ❌ brak Node serverless; limity procesów | ✅ PM2/Docker (utrzymanie po mojej stronie) |
| Baza danych | ✅ Supabase (już używana!) + pgvector | ⚠️ MySQL — brak pgvector, migracja schematu | ✅ własny Postgres (utrzymanie backupów po mojej stronie) |
| Dane w Polsce / jedna faktura PL | ❌ UE (region Frankurt), faktura USD/EUR | ✅ | ✅ |
| Utrzymanie (aktualizacje, bezpieczeństwo, backupy) | ~zero | niskie, ale i niskie możliwości | realna praca administracyjna |
| Koszt startowy | **0 zł** | ~kilkadziesiąt zł/mies. | ~50–120 zł/mies. |

**Rekomendacja: Vercel + Supabase.**

- Kontynuacja obecnego stanu (apka już na Vercelu, dane już w Supabase) — migracja bez przeprowadzki.
- Zero utrzymania: to system **jednoosobowej redakcji**, każda godzina na administrację serwera to godzina zabrana z contentu.
- Harmonogram: na start **Upstash QStash (darmowy)** lub cron-job.org wyzwala endpoint pipeline'u 16×/dzień — Vercel Hobby wystarczy; upgrade do Vercel Pro ($25/mies.) dopiero, gdy zależy nam na precyzji i 40 wbudowanych cronach — bez zmiany kodu.
- **seohost pozostaje realną opcją zapasową:** jeżeli kluczowe są dane w PL albo jedna polska faktura — architektura jest przenośna (Next.js w kontenerze + własny Postgres + systemowy cron = 1 dzień migracji). Zostawiamy to jako świadomą decyzję architektoniczną, nie domyślne rozwiązanie.

---

# 11. Koszty

Szacunki miesięczne (USD, ceny API wg cenników: Haiku ~$1/$5, Sonnet ~$3/$15 za 1M tokenów we/wy; prompt caching i batche obniżają wejście):

| Pozycja | MVP (start) | Stabilnie |
|---|---|---|
| GitHub (repo prywatne) | $0 | $0 |
| Vercel | $0 (Hobby + QStash/cron-job.org) | $25 (Pro — precyzyjny cron, logi dłużej) |
| Supabase | $0 (plan darmowy, region UE) | $0–25 |
| Anthropic API — ETAP 1 (16 przebiegów/dzień: triaż Haiku + writer Sonnet, z prefiltrowką) | $25–45 | $30–60 |
| Anthropic API — ETAP 2 (1–3 tematy/dzień: research + 2–4 drafty) | $15–40 | $25–60 |
| Search API do deep researchu (Tavily/Brave, opcja) | $0–10 | $20–50 |
| Telegram bot | $0 | $0 |
| **Razem** | **~$40–95 (~150–400 zł)** | **~$100–220 (~400–900 zł)** |

Dźwignie optymalizacyjne, gdyby przekroczyć budżet: częstotliwość 6:00–22:00 → 8:00–20:00, więcej źródeł WARM/COLD zamiast HOT, mocniejsza prefiltrowka, Batch API (-50%) dla triażu (akceptuje opóźnienie do 24 h — dla większości źródeł bez znaczenia), limit nowych kandydatów na przebieg.

Każdy przebieg zapisuje koszt w `runs` → widzę koszt na **użytecznego** kandydata (nie na tokeny) i mogę tym sterować.

---

# 12. Roadmapa

| Faza | Tygodnie | Zakres | Definicja ukończenia (DoD) |
|---|---|---|---|
| **F0 — Fundament** | 1 | repo/monorepo, Next.js + auth, schemat bazy + migracja obecnych danych z Supabase, rejestr 64 źródeł z tierami (YAML), szkielet UI, CI deploy z GitHuba | Aplikacja wdrożona na Vercel z GitHuba; pusta kolejka; źródła widoczne w panelu |
| **F1 — ETAP 1 produkcyjnie** | 2–3 | adaptery (RSS ~20 źródeł + HTML dla gov.pl/RCL/DU + Wykop/Reddit + seed inbox), prefiltrowka, triaż, clustering, writer, kolejka z 3 decyzjami + TTL + eksploracja, run logi, scheduler QStash | 6:00–22:00 działa bez nadzoru; 5–15 sensownych kandydatów dziennie; decyzje zapisane; duplikaty scalone |
| **F2 — ETAP 2 + Telegram** | 4–5 | deep research + brief, drafty post/rolka, wersje + diff + uwagi, profil stylu v1 (z interview + istniejących publikacji), powiadomienia i decyzje z Telegramu | Z ROZWIŃ do gotowca < 15 min; decyzje działają z telefonu; każda korekta zostawia ślad |
| **F3 — Uczenie** | 6–7 | wagi gustu w scoringu (interpretable), biblioteka przykładów z retrievalem, lekcje z diffów, dashboard źródeł (health/yield/propozycje + accept), kwota eksploracji | Score odzwierciedla moje decyzje (rośnie % trafień); tygodniowy retro raport przychodzi na Telegram |
| **F4 — Doskonałość** | ciągle | dashboard KPI, golden set + ewaluacje promptów w CI, evergreeny, eksport publikacji (copy/Buffer), ewaluacja X API | Edit distance maleje z kwartału na kwartał; scoop rate mierzalny i rosnący |

Priorytet w razie skracania: **F1 > F2 > F3**. F1 sama w sobie już zdejmuje ręczne szukanie tematów; F2 zdejmuje pisanie; F3 czyni system coraz lepszym zamiast statycznego.

---

# 13. Ryzyka

| Ryzyko | Prawdop. | Wpływ | Mitygacja |
|---|---|---|---|
| Scraperzy łamią się po zmianach HTML stron urzędów | wysokie | średni | adaptery deklaratywne (konfiguracja, nie kod), health-tracking + alert po 3 nieudanych crawlach, preferencja RSS/tam gdzie są |
| Koszty LLM rosną niekontrolowanie | średnie | średni | budżet per przebieg, prefiltrowka, log kosztu w `runs`, alert progu, dźwignie z sekcji 11 |
| Halucynacje liczb/faktów w gotowcach | średnie | **wysoki** (wiarygodność marki) | claims z linkami w briefie, „liczba bez źródła nie wchodzi", self-review, badge fact_status na karcie |
| Bańka tematyczna (tylko podatki i ZUS) | średnie | wysoki (nuda feedu) | kwota eksploracji 20%, anty-dominacja, INSPIRE/INTENT obowiązkowo w kolejce, retro raport |
| Zalanie kolejki (za dużo kandydatów) | średnie | średni | cap 20, limit 3–6 nowych/przebieg, agresywny próg score, LATER z karą |
| Brak dostępu do X API | pewne na start | średni | skrzynka zasiewów (U4), Wykop/Reddit/fora, zakup API w F4 gdy ROI potwierdzone zasiewami |
| Limity planu Vercel Hobby (cron 1×/dzień, funkcje 10 s → dłuższe) | pewne | niski | zewnętrzny scheduler QStash/cron-job (już w architekturze); Pro bez zmiany kodu |
| Regresja jakości po zmianie promptu | średnie | średni | wersjonowanie promptów + golden set w CI (U16) |
| Awaria pipeline'u po cichu | średnie | średni | idempotentność, tabela `runs`, alert po 3 nieudanych przebiegach na Telegram |
| Pojedynczy użytkownik = bus factor | — | świadome | całość w repo + ten dokument + ADR-y; system dokumentowany na bieżąco |

---

# 14. KPI — instrumentacja

Mapowanie pytań z §29 handoffu na mierzalne metryki (zbierane automatycznie, przegląd w UI + tygodniowy retro):

| Pytanie z handoffu | Metryka | Źródło danych |
|---|---|---|
| „Jak często widzę coś, co chcę opublikować?" | % sesji z ≥ 1 wyborem | decisions (sesje z kontekstu) |
| „Jaki % kandydatów zasługuje na rozwinięcie?" | selected / shown (dziennie, tygodniowo) | kpi_snapshots |
| „Jak często Radar znajduje temat przede mną?" | scoop rate = 1 − (selected z tagiem `seen_elsewhere` / selected) | decisions.reject_code/tag |
| „Jak często kandydat prowadzi do publikacji?" | published / selected | published_items |
| „Jak mało muszę poprawiać gotowiec?" | edit distance (znaki zmienione / długość) + trend | drafts.edit_diff |
| „Czy Radar regularnie mnie zaskakuje?" | % wybranych kandydatów oznaczonych „E — eksploracja" | candidates.is_exploration + decisions |
| (koszt, nieujęty w handoffu) | koszt na wybranego kandydata | runs.cost_usd |

Zasada z §29 zachowana: 10 dobrych kandydatów > 500 newsów — dlatego KPI liczone są **na wybór i publikację**, nie na wolumen.

---

# 15. Czego świadomie NIE robimy

Żeby system nie spuchł:

- **Bez auto-publikacji** — ja zatwierdzam wszystko (§16 handoffu: „mój materiał", nie automat).
- **Bez multi-user i ról** — jednoosobowa redakcja; auth tylko jako zamek.
- **Bez fine-tuningu modeli** — retrieval par + profil stylu wystarcza (U10) i jest odwracalny.
- **Bez czarnoskrzynkowego rekomendera** — wagi interpretowalne, każdy score z uzasadnieniem.
- **Bez scrapowania za loginem/paywallem i bez obchodzenia robots.txt** — tylko publiczne źródła; user-agent identyfikujący.
- **Bez rozbudowy social-poza-real (auto-likowanie, auto-follow)** — to nie jest narzędzie bottingu.

---

# 16. Decyzje do podjęcia

Pytania, na które potrzebuję odpowiedzi przed F0/F1:

1. **Hosting:** zatwierdzamy Vercel + Supabase (rekomendacja), czy dane-w-PL/jedna faktura PL są twardym wymogiem zmieniającym decyzję na seohost VPS?
2. **Obecny pipeline:** co dziś fizycznie generuje kandydatów (skrypt lokalny? n8n/Make? ręcznie w Claude?) — i czy na czas migracji (F0–F1) ma działać równolegle, żeby nie było przerwy w dostawie tematów?
3. **Migracja danych:** przenosimy obecne 51 tematów + 64 źródła do nowego schematu (tak zakładam — CR-id zostają)?
4. **Budżet:** jaki miesięczny koszt API jest komfortowy? (Powyższe szacunki: ~150–400 zł/mies. na start.)
5. **Telegram:** zgadzasz się na tego kanał powiadomień i decyzji? (Alternatywa: powiadomienia push w przeglądarce.)
6. **Platformy publikacji:** gdzie finalnie lądują materiały (LinkedIn / Instagram / TikTok / X)? Od tego zależą formaty eksportu w warsztacie (F2/F4).
7. **Zasiewy z X:** czy planowany jest zakup X API w horyzoncie F4, czy skrzynka zasiewów ma być stałym rozwiązaniem?
8. **Profil stylu v1:** czy są dostępne dotychczas opublikowane materiały (posta + rolki) do wstępnego zbudowania profilu stylu i biblioteki przykładów przed startem F2?

---

*Dokument towarzyszy: `mockup/kolejka-decyzji.html` — interaktywna makieta kolejki decyzji (ETAP 1) i warsztatu (ETAP 2), zbudowana na realnych kandydatach z 2–3.09.2026. Służy jako specyfikacja UX dla F1/F2.*
