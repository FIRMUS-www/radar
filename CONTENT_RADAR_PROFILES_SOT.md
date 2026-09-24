# CONTENT RADAR — PROFILE ARCHITECTURE SOT

**Status:** kanoniczny  
**Data:** 2026-09-24

## 1. Zasada nadrzędna

Content Radar jest jednym produktem i jednym wspólnym silnikiem researchu.

Nie tworzymy osobnych aplikacji ani forków dla marek.

Architektura:

```
wspólny collector / research engine
→ wspólny katalog techniczny źródeł
→ autonomiczna konfiguracja źródeł per profil
→ wspólna deduplikacja
→ wspólny magazyn kandydatów
→ niezależna ocena relewancji per profil
→ osobne feedy, reakcje i zapisane per profil
```

Ten sam kandydat może należeć do więcej niż jednego profilu. Wtedy istnieje jeden CR, ale jest widoczny w obu feedach.

## 2. Aktywne profile

### bizgenerator
**Nazwa UI:** Biz Generator  
**Akcent:** `#ff008c` — magenta zgodna z BizGenerator.pl  
**Tło:** czarne / dark

Cel: realne pomysły na pierwszy lub dodatkowy mały biznes i pomoc od pomysłu do pierwszej sprzedaży.

Priorytety:
- business_idea
- person_idea_fit
- first_sale
- tool_resource
- cost_risk_formality
- build_in_public
- accounting_support

### accounting
**Nazwa UI:** Księgowość / BIZ+  
**Akcent:** `#e6fa24` — limonka  
**Tło:** czarne / dark

Cel: Najlepsza Księgowość, BIZ+ i praktyczne treści księgowe/JDG.

Priorytety:
- tax_zus
- ksef_formalities
- mistake_risk
- accounting_relationship
- change_accounting
- jdg_case
- jdg_practice
- bizplus_product

## 3. Kontrakt kandydata

Profilowanie jest zapisane w `content_radar_items.content_features`.

Docelowy format:

```json
{
  "radar_profiles": {
    "bizgenerator": {
      "relevance": 0,
      "pillar": "business_idea",
      "why": "..."
    },
    "accounting": {
      "relevance": 0,
      "pillar": "tax_zus",
      "why": "..."
    }
  },
  "profile_keys": ["bizgenerator", "accounting"],
  "primary_profile": "bizgenerator"
}
```

Do `profile_keys` trafia profil z relewancją >=55.

Jeśli oba profile mają relewancję >=55, kandydat jest wspólny i nie tworzymy duplikatu CR.

Pola `bg_pillar` należące do rdzenia Biz Generatora (`business_idea`, `person_idea_fit`, `first_sale`, `tool_resource`, `cost_risk_formality`, `build_in_public`) nie mogą zostać automatycznie sklasyfikowane jako `accounting` przez fallback lub brak metadanych. Taki rekord wymaga jawnej oceny profilu, a domyślnym kontekstem jest `bizgenerator`.

## 4. Reakcje i stan użytkownika

Reakcje są niezależne per profil.

Klucz stanu:
`(cr, profile_key)`

Tabela:
`public.content_radar_item_profile_state`

Kliknięcie:
- Więcej takich
- Dobre
- Nie interesuje
- Zły kąt
- Zapisz na później
- otwarcie karty

w jednym profilu nie może zmieniać stanu tego samego CR w drugim profilu.

Historyczny `content_radar_profiles/default-selection` pozostaje globalnym profilem uczenia legacy i może być najwyżej pomocniczym sygnałem. Nie może nadpisywać niezależnej relewancji profili projektowych.

## 5. Źródła — autonomia profili

`public.content_radar_sources` jest wspólnym **katalogiem technicznym źródeł**. Przechowuje tożsamość źródła: nazwę, URL, typ, kategorię i metadane wspólne.

Operacyjna konfiguracja źródła należy do:

`public.content_radar_profile_sources`

Klucz logiczny:
`(source_id, profile_key)`

Każdy profil ma własne:
- przypisanie źródła,
- `active`,
- `priority`,
- opcjonalną notatkę profilową.

Brak rekordu w `content_radar_profile_sources` oznacza, że źródło **nie należy do danego profilu** i nie może być używane jako źródło rejestrowe tego profilu.

To samo źródło może należeć do obu profili, ale:
- wyłączenie go w BG nie wyłącza go w KSI,
- zmiana priorytetu w BG nie zmienia priorytetu w KSI,
- usunięcie z BG usuwa tylko przypisanie BG,
- dodanie źródła z ekranu BG przypisuje je domyślnie tylko do BG.

Pola `content_radar_sources.profile_keys`, `active` i `priority` są od 2026-09-24 wyłącznie **legacy mirror** dla zgodności przejściowej. Nie mogą sterować nowym researchem.

Profil Biz Generator nie dziedziczy automatycznie źródeł Księgowości. Wspólny katalog nie oznacza wspólnego feedu źródeł.

## 6. UX

Na głównej stronie Content Radaru znajduje się przełącznik:
- Biz Generator
- Księgowość / BIZ+

Zmiana profilu zmienia jednocześnie:
- feed,
- reakcje,
- zapisane,
- liczniki,
- kontekst kandydata,
- kolor akcentu,
- źródła.

Na stronie źródeł przełącznik profilu pokazuje wyłącznie źródła przypisane do wybranego profilu. Użytkownik może niezależnie:
- dodać źródło do aktualnego profilu,
- włączyć/wyłączyć je,
- zmienić priorytet,
- usunąć je z profilu.

Kolory są funkcjonalnym kodem kontekstu:
- BG = magenta,
- KSI/BIZ+ = limonka.

Ostatnio używany profil jest zapamiętywany lokalnie.

## 7. Zasada rozwoju

Nowy profil dodajemy wtedy, gdy zmienia się funkcja wyszukiwania i oceny materiałów, a nie tylko dlatego, że powstaje nowa domena lub landing.

Najlepsza Księgowość, BIZ+, FNR i Zmieniamy Księgowość korzystają obecnie ze wspólnego profilu `accounting`.

Nie tworzymy osobnego engine'u dla kolejnego profilu.
