# Content Radar — kontrakt Biz Generatora

## Cel

Content Radar ma wspierać markę BizGenerator.pl w obietnicy:

> Łatwy start Twojej firmy. Pomoc krok po kroku.

Radar nadal wykrywa ważne informacje dla małych firm, w tym księgowość, podatki i prawo. Te tematy są teraz warstwą wspierającą. Główny priorytet stanowią realne pomysły na pierwszy lub dodatkowy biznes, dopasowanie człowieka do pomysłu oraz droga do pierwszej sprzedaży.

## Odbiorcy

- osoby planujące pierwszy biznes,
- osoby szukające działalności dodatkowej,
- matki dysponujące ograniczonymi oknami czasu,
- osoby około 50. roku życia i w wieku przedemerytalnym,
- osoby potrzebujące startu z małym kapitałem i kontrolowanym ryzykiem.

## Filary i docelowe proporcje

| Filar | Udział |
|---|---:|
| Pomysły na biznes | 40% |
| Dopasowanie pomysłu do człowieka | 20% |
| Pierwszy klient i pierwsza sprzedaż | 20% |
| Koszty, ryzyka i formalności | 10% |
| Eksperymenty i budowanie Biz Generatora | 10% |

Księgowość nie jest usuwana. Kandydat księgowy powinien zostać przypisany do filaru kosztów, ryzyk i formalności albo do konkretnego modelu biznesowego.

## Taksonomia źródeł

1. **Sygnały intencji** — grupy i dyskusje osób rozważających biznes, side hustle, pracę po 50. roku życia, pracę z domu i działalność lokalną.
2. **Popyt rynkowy** — OLX, Facebook Marketplace, Allegro Lokalnie, platformy usług lokalnych, zapytania i ogłoszenia klientów.
3. **Modele biznesowe** — zagraniczne społeczności mikrofirm, katalogi franczyz, Etsy, eBay, TikTok Shop, platformy twórców.
4. **Narzędzia i automatyzacja** — AI, no-code oraz rozwiązania obniżające koszt rozpoczęcia działalności.
5. **Weryfikacja** — GUS, CEIDG, PARP, PFR, urzędy, regulaminy platform, cenniki i źródła pierwotne.
6. **Własne dane** — reakcje odbiorców, wyniki assessmentu, pytania społeczności i eksperymenty Biz Generatora.
7. **Wsparcie operacyjne** — księgowość, podatki, ZUS, prawo i obowiązki przedsiębiorcy.

Social media i komentarze są źródłem sygnału oraz języka odbiorców. Fakty, liczby i wymagania należy potwierdzać w źródłach pierwotnych.

## Kontrakt kandydata

Nowe pola są zapisywane w istniejącym polu JSON `content_features`, dzięki czemu pivot nie wymaga natychmiastowej migracji bazy:

```json
{
  "bg_pillar": "business_idea",
  "bg_series": "Biznes do sprawdzenia",
  "problem_desire_signal": "Właściciele chcą sprzedać rzeczy, ale nie chcą prowadzić procesu",
  "target_person": "Osoba komunikatywna, działająca lokalnie, z 5–10 godzinami tygodniowo",
  "business_model": "Przygotowanie i prowadzenie sprzedaży cudzych rzeczy za opłatę lub success fee",
  "startup_cost": "niski",
  "startup_time": "kilka dni",
  "difficulty": "średnia",
  "first_customer_path": "Rodzina, sąsiedzi, grupy lokalne",
  "main_risk": "Czas poświęcony przedmiotom bez realnego popytu",
  "smallest_test": "Sprzedaż jednego przedmiotu dla znanej osoby",
  "assessment_connection": "Czy ten biznes jest dla Ciebie?",
  "product_connection": "ZLAPP",
  "discovery_source": "community",
  "discovery_query": null,
  "discovered_at": "ISO-8601"
}
```

Dozwolone wartości `bg_pillar`:

- `business_idea`
- `person_idea_fit`
- `first_sale`
- `tool_resource`
- `cost_risk_formality`
- `build_in_public`
- `accounting_support`

## Ocena

Kandydat do serii „Biznes do sprawdzenia” powinien odpowiedzieć na siedem pytań:

1. Jak powstaje przychód?
2. Kto płaci?
3. Dla kogo model jest odpowiedni?
4. Ile czasu i pieniędzy wymaga start?
5. Jak zdobyć pierwszego klienta?
6. Co może spowodować porażkę?
7. Jaki jest najmniejszy test bez pełnego uruchomienia firmy?

Brak odpowiedzi nie zawsze odrzuca kandydata, ale musi obniżyć gotowość do publikacji i wskazać potrzebny research.

## Zasady bezpieczeństwa i jakości

- Zachowujemy reconcile przed researchem, deduplikację, dowody, rejestr źródeł i fail-closed.
- Nie tworzymy duplikatu, gdy istniejący kandydat można uzupełnić.
- Nie automatyzujemy outboundu ani scrapingu niezgodnego z zasadami platform.
- `source_url`, `discovery_source`, `discovery_query` i `discovered_at` powinny umożliwiać odtworzenie pochodzenia materiału.
- Popularność nie zastępuje weryfikacji opłacalności.
- Materiał nie może obiecywać łatwych pieniędzy.

## Pierwszy przypadek wzorcowy

**Lokalny agent sprzedaży rzeczy**

Osoba pomaga właścicielom wycenić, opisać i sprzedać niepotrzebne przedmioty. Nie kupuje zapasu. Zarabia na stałej opłacie, procencie od sprzedaży albo modelu mieszanym. Pierwszy test to sprzedaż jednego przedmiotu dla rodziny lub sąsiada. ZLAPP może później stać się narzędziem tego modelu.
