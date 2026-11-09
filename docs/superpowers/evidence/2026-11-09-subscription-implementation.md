# Przełączanie abonamentów - wykonanie 09.11.2026

Kod jest zaimplementowany i po niezależnym przeglądzie. Uruchomienie w działającym
Threadbear wymaga jeszcze końcowego sprawdzenia, scalenia i aktywacji konfiguracji.
Zadanie: [SCL-412](https://linear.app/sclaex/issue/SCL-412).

## Co działa w implementacji

- Pula wyznacza kolejność Claude, Codex, Grok, Google. Przypięte konto pozostaje
  przypięte; istniejąca rozmowa zmienia usługę dopiero po limicie.
- Trwały zapis cyklu i kolejki zapobiega ponownej próbie tego samego konta.
  Nowa wiadomość ma pierwszeństwo, a Stop usuwa oczekującą kontynuację.
- Limit modelu blokuje parę konto/model. Nie oznacza wyczerpania całego konta.
  Po wyczerpaniu puli runner czeka na reset z minutą buforu; bez terminu 30 minut.
- Grok Build i Google Antigravity używają oficjalnych CLI i abonamentów. Integracja
  usuwa źródła API ze środowiska; dla Google wyłącza dodatkowe kredyty.
- Nowe integracje obsługują MCP, wznowienie i przerwanie. Nazwy usług są poprawne
  w runnerze, aplikacji Mac i kliencie web. iOS i Convex tolerują nowe identyfikatory.
- Eksperyment `subscriptionFallback` jest domyślnie wyłączony. Nowe CLI nie mają
  automatycznej aktualizacji. Niepotwierdzone logowanie wyłącza konto z wyboru.

## Dowody

| Sprawdzenie | Wynik |
| --- | --- |
| Bazowe testy przed zmianą | PASS: 49 |
| Testy obszarów objętych zmianą po poprawkach przeglądu | PASS: 183 |
| Niezależny przegląd | Brak otwartych ustaleń; 34 testy ponowione przez recenzenta |
| Runner, web i Convex typecheck | PASS |
| Pełny check --quick i tb land --dry-run | PASS na 5cb53618; po dodatkowej korekcie Stop wymagane ponowienie |
| Adaptery i kontynuacja po korekcie Stop | PASS: 38 testów |
| Kompilacja Mac przez `./check.sh --app` | PASS |
| `swift build --target ThreadbearCore` | PASS |
| XCTest Mac i Testing iOS | UNVERIFIED: brak pełnego Xcode, dostępne CommandLineTools |
| Odczyt bieżącego modelu PhoneAccount dla trzech identyfikatorów | PASS: skompilowany wycinek źródła, bez zmiany kodu iOS |
| Interfejs Mac na dev runnerze | PASS: dump i obejrzany obraz okna; Google, model, zakończona tura i karta Done |
| Rzeczywiste oficjalne CLI | PASS: oba abonamenty, mały prompt, MCP, nowy proces i wznowienie, cancel |
| Rzeczywiste adaptery Threadbear | PASS: Grok i Google użyły MCP i zachowały wynik po wznowieniu |
| Osobny dev runner | PASS: obie usługi wykonały list_accounts, end_turn i odpowiedź OK |
| Limit i przejście przez cztery usługi | PASS syntetyczny; prawdziwych limitów celowo nie wyczerpywano |

Prywatne logi prób pozostają poza Git. Własny dev runner i debug app zostały
zatrzymane, a obraz okna po obejrzeniu usunięty.

## Ograniczenia i różnice względem planu

Wspólny transport ACP zastępuje osobne normalizatory obu usług. Logowanie,
ustawienia i kwalifikowanie modeli pozostają osobne; adaptery Claude/Codex nie
zostały przeniesione do nowej abstrakcji. Wspólne testy sprawdzają rzeczywisty
proces potomny i most MCP, a nie tylko funkcje parsujące.

Grok w próbie nie zapytał o zgodę przed zapisem. Google odmówiło zapisu,
ale nadpisanie lokalnych reguł uprawnień nie jest potwierdzone. Dlatego obie
nowe usługi dopuszczamy tylko w trybie full i bez confined. Nieobsługiwany tryb
powoduje pominięcie konta, nigdy podniesienie uprawnień. Szczegóły zawiera
[kontrakt CLI](2026-11-09-subscription-cli-contracts.md).

Przegląd wykrył cztery problemy, wszystkie poprawione i objęte testami regresji:
kolejkę po Stop, zapis rozpoczęcia kolejnej tury w istniejącym CLI, ponawianie
sondy po zalogowaniu oraz pomijanie konta, którego logowanie wygasło w trakcie
cyklu. Pierwszy commit poprawek przeglądu: `2319ce89`. Dodatkowo odtworzono
Stop podczas inicjalizacji oraz Stop nowej tury zaraz po zakończeniu poprzedniej.
Kolejka przyjmuje pierwszą wiadomość przed zakończeniem inicjalizacji, a po
anulowaniu przed promptem pozostawia zdrową sesję do następnej wiadomości.
Testy przed poprawką wykazały brak wyniku i przerwanie następnej wiadomości;
po poprawce oba scenariusze przechodzą dla obu usług.

## Wdrożenie

Oczekuje na końcowy check, `tb land`, bezpieczną zmianę wydania i włączenie
konfiguracji u Michała. Nie jest to jeszcze potwierdzenie działania na żywo.
Przypomnienie o ocenie eksperymentu: `1c133315`, cztery dni od planowanego
uruchomienia. Nie trzeba zmieniać aplikacji iOS ani instalować jej na telefonie.
