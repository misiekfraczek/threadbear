# Kontynuacja rozmowy po limicie abonamentu

Data: 2026-11-09. Status: specyfikacja zaakceptowana przez Michała 09.11.2026, bez zmian w kodzie produktu.
Repo bazowe: `5bbf9f64`. Wątek: `08c2784c-f107-48da-a4c7-463081907a9b`.

## Cel i decyzje Michała

Rozmowa w Threadbear ma kontynuować zadanie po wyczerpaniu limitu usługi, bez ręcznego przenoszenia tekstu do innego agenta. Korzystamy z istniejących abonamentów i oficjalnych programów dostawców. Michał ustalił kolejność: Claude, Codex, Grok, Google.

Proponowana interpretacja tej kolejności: nowe rozmowy w puli automatycznej zaczynają od dostępnego Claude. Ręczne wskazanie modelu nadal wybiera usługę początkową. Rozmowy już trwające pozostają na obecnej usłudze do wyczerpania limitu. Po przełączeniu nie wracają same do wcześniejszej usługi, dopóki mogą pracować. Nie przestawiamy wstecz działających rozmów przy wdrożeniu.

## Stan potwierdzony

- Typ `Provider` w `runner/src/protocol.ts` obsługuje Claude i Codex.
- `runner/src/runner/pools.ts` obsługuje zmianę usługi, notatkę przekazującą kontekst i automatyczną kontynuację. Obecnie po limicie kolejnej automatycznej próby przechodzi do oczekiwania. To wymaga rozszerzenia na więcej kont.
- `runner/src/pools.ts` wybiera najpierw konto bieżącej usługi, potem inne usługi według kolejności w puli. Dostępność uwzględnia blokadę i obecny próg pozostałego limitu.
- W konfiguracji Michała dodano wzajemnie Claude i Codex do obu istniejących pul. Odczyt ustawień potwierdził zapis. Nie wywołano rzeczywistego limitu w celu testu.
- Na Macu są `grok` i `agy`. `agy models` zwróciło katalog modeli. `grok models` wypisało brak uwierzytelnienia, a następnie katalog; katalog nie dowodzi działającego logowania. `grok usage` odmówiło odczytu limitu w tym trybie.
- Nazwy planów, tożsamości kont Groka/Google i rzeczywiste wywołania modeli pozostają niepotwierdzone. Nie odczytywano tokenów.

## Zakres integracji

Dodajemy dwie implementacje istniejącego interfejsu `AgentAdapter`: Grok Build i Google Antigravity. Identyfikatory usług: `grok` i `antigravity`; nazwa w interfejsie dla drugiej: Google (Antigravity). Uruchamiamy oficjalne programy z logowaniem zarządzanym przez ich własne narzędzia. Nie kopiujemy tokenów ani nie wysyłamy zapytań bezpośrednio do prywatnych endpointów abonamentowych.

Każda integracja musi obsłużyć start, odpowiedzi strumieniowe, wynik końcowy, błędy, przerwanie, wznowienie sesji oraz narzędzia Threadbear przez MCP. Model wybieramy z katalogu danej usługi; identyfikatorów modeli nie wpisujemy na stałe. Google używa modeli Gemini dostępnych na koncie, aby nie dublować Claude przez inną usługę.

Możliwości trybów uprawnień sprawdzamy przed startem. Brak obsługi pytania o zgodę lub ograniczeń folderu nie może przełączyć rozmowy na pełne uprawnienia. Konto niespełniające wymagań rozmowy pomijamy z czytelnym powodem. Wersja pierwsza nie obejmuje automatycznej instalacji ani aktualizacji nowych CLI.

Abonamenty są jedynym sposobem rozliczenia tej funkcji. Integracja nie może użyć odziedziczonego klucza API jako cichego zastępstwa logowania. Przed włączeniem konta trzeba potwierdzić tryb logowania i jego tożsamość bez odczytu sekretów. Jeżeli CLI nie pozwala odróżnić trybu abonamentowego, konto nie zostaje włączone do automatycznego przełączania.

## Wybór kolejnego konta

Pula automatyczna ma kolejność usług Claude, Codex, Grok, Google. Przy wyczerpaniu konta sprawdzamy najpierw inne dostępne konta tej samej usługi, następnie pozostałe usługi w tej kolejności. Pomijamy konto już użyte w bieżącym cyklu odzyskiwania, konto z potwierdzonym limitem, niezalogowane, bez działającego CLI lub bez wymaganych możliwości. Po limicie Codex, gdy Claude nadal jest zablokowany, kolejne będą Grok i Google.

Istniejący wybór kont wewnątrz usługi pozostaje bez zmian. Brak danych o limicie oznacza stan nieznany, nie pełny dostęp ani wyczerpanie. Dopuszczamy jedną próbę konta o nieznanym limicie w cyklu. Konkretne limity modeli nie blokują automatycznie całego abonamentu, jeżeli CLI rozróżnia zakres limitu.

Automatyczny cykl uruchamia wyłącznie potwierdzony błąd limitu abonamentu. Odmowa modelu, błąd logowania, płatności, przekroczenie kontekstu i nieokreślony HTTP 429 nie są takim sygnałem. Obecna obsługa przerw sieciowych pozostaje osobnym mechanizmem.

Nowa wiadomość użytkownika ma pierwszeństwo przed automatycznym poleceniem kontynuacji. Ręcznie przypięte konta pozostają przypięte. Wdrożenie ustawia pulę automatyczną jako domyślną dla nowych rozmów Michała; istniejące pule zachowują identyfikatory i dostają tę samą kolejność kont. Zmiana nie przerywa aktywnych tur.

## Przekazanie pracy i trwałość

Przed uruchomieniem następnego agenta runner kończy obsługę starej sesji. Zachowuje identyfikator rozmowy, folder i uprawnienia. Przekazuje cel użytkownika, istotne ustalenia, ostatnie wyniki oraz informację o przerwaniu. Wykorzystuje istniejące `handoff-history.ts` i mechanizm notatki przekazującej rozmowę. To wybrane fragmenty historii, a nie kopia wewnętrznego kontekstu modelu.

Nowy agent dostaje instrukcję sprawdzenia stanu plików i wyników ostatnich działań przed ich powtórzeniem. Runner nie odtwarza wykonanych narzędzi ani całej pierwotnej wiadomości jako nowego zadania. Przy nieznanym wyniku operacji zewnętrznej agent musi najpierw ustalić, czy operacja się zakończyła. Sama notatka przekazania nie gwarantuje braku powtórzeń skutków zewnętrznych.

Stan cyklu zawiera jego identyfikator, konta już wypróbowane, źródłową turę oraz identyfikator zaplanowanej kontynuacji. Zapis trwały poprzedza uruchomienie kolejnej próby. Restart runnera i ponowne zdarzenie błędu nie mogą utworzyć drugiej kontynuacji tej samej próby. Jeden cykl próbuje najwyżej każdego uprawnionego konta raz.

Po wyczerpaniu dostępnych kont rozmowa czeka do najbliższego znanego resetu z obecnym buforem jednej minuty. Bez czasu resetu używa obecnego odroczenia 30 minut. Pobudka ponownie ocenia konta i zaczyna nowy cykl od pierwszej dostępnej usługi w ustalonej kolejności. Jeżeli żadne konto nie może pracować z powodów innych niż limit, pokazuje konkretną przeszkodę wymagającą działania, zamiast obiecywać wznowienie po resecie.

## Interfejs, protokół i zgodność

Najpierw aktualizujemy kontrakt w `docs/protocol.md`, następnie runner i klientów. Mac, iPhone, strona oraz backend muszą przenosić nowe identyfikatory usług bez gubienia rozmów. Starszy klient pokazuje rozpoznawalną nazwę zastępczą lub wymaganie aktualizacji; nie interpretuje nowej usługi jako Claude.

Wybór konta i modelu pozostaje w obecnych menu. Zmiana usługi tworzy widoczną notatkę z powodem oraz nazwą nowego modelu. Oczekiwanie pokazuje termin, jeśli jest znany. Nie tworzymy nowego okna ani dodatkowego ekranu ustawień w pierwszej wersji.

Zmiana obejmuje rozpoznawanie kont, ustawienia modeli, rejestr integracji, klasyfikację błędów, mechanizm pul, stan zapisany na dysku i prezentację nowych usług. Dokumenty użytkownika, instalacji na Macu i rozwijania forka aktualizujemy wraz z implementacją. Nowa funkcja jest eksperymentem wyłączonym domyślnie, włączonym u Michała dopiero po sprawdzeniu. Rejestr eksperymentu i przypomnienie o przeglądzie powstają przy wdrożeniu.

## Sprawdzenie przed wdrożeniem

| Scenariusz | Warunek odbioru |
| --- | --- |
| Claude, Codex i Grok kolejno zgłaszają limit | Google przejmuje tę samą rozmowę; każde konto użyte najwyżej raz w cyklu |
| Grok nie jest zalogowany | Zostaje pominięty z powodem; Google może kontynuować |
| Wszystkie limity wyczerpane | Trwały stan oczekiwania i jedna kontynuacja po resecie |
| Restart w trakcie przełączenia | Brak podwójnego uruchomienia i brak utraty wiadomości użytkownika |
| Odmowa, błąd logowania, kontekstu lub nieokreślony 429 | Nie uruchamiają cyklu dla limitu abonamentu |
| Przerwanie przez użytkownika | Zatrzymuje cykl; brak kolejnej automatycznej próby |
| Tryb wymagający zgód lub izolacji | Kolejny agent zachowuje ograniczenia albo zostaje pominięty |
| Wcześniejsza operacja o nieznanym wyniku | Notatka wymaga sprawdzenia wyniku; runner nie odtwarza narzędzia |
| Nowe usługi w Mac/iPhone/web | Rozmowa, model i status są widoczne; brak błędu odczytu danych |
| Wyłączenie eksperymentu | Istniejące rozmowy pozostają czytelne; nowe integracje nie uruchamiają się automatycznie |

Testy jednostkowe używają syntetycznych strumieni CLI i błędów, bez danych prywatnych. Minimalne testy rzeczywiste sprawdzają logowanie abonamentowe, MCP, wznowienie, przerwanie i przekazanie kontekstu. Używają najtańszego dostępnego modelu danej usługi, małego promptu i katalogu pod systemowym TMPDIR. Nie wyczerpujemy abonamentu celowo. Pełne sprawdzenia repo uruchamiamy według lokalnych zasad; maszyny autora upstream nie są środowiskiem Michała.

## Kolejny etap i ograniczenia dowodów

Po akceptacji dokumentu powstaje plan implementacji. Pierwszy etap planu sprawdzi formaty zdarzeń, obsługę MCP i uprawnień oraz logowanie abonamentowe obu CLI. Pomoc CLI i katalog modeli potwierdzają dostępność poleceń, ale nie dowodzą zgodności pełnego przepływu z Threadbear. Grok wymaga wyjaśnienia braku uwierzytelnienia. Nie obiecujemy gotowej integracji na podstawie samej listy modeli.

Dokumentacja dostawców sprawdzona 09.11.2026: [Grok Build](https://docs.x.ai/build/overview), [przejście kont indywidualnych Google na Antigravity](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals). Źródłem zachowania Threadbear są wymienione pliki repo i sekcja Pools w `docs/protocol.md`.
