# Kontynuacja po limicie abonamentu - plan implementacji

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Wybór sposobu wykonania należy do Michała; rekomendacja dla tego planu: executing-plans.

Goal: rozmowa kontynuuje pracę na abonamentach w kolejności Claude, Codex, Grok, Google.

Architecture: dwie nowe implementacje `AgentAdapter` wykorzystują oficjalne CLI i wspólny kontrakt zdarzeń Threadbear. Trwały cykl przełączania w runnerze zastępuje ograniczenie do jednej automatycznej próby. Interfejsy klientów zachowują obecne menu i pokazują nowe usługi.

Tech Stack: TypeScript, Node, oficjalne Grok Build i Antigravity CLI, MCP, Swift, React, Convex. Bez nowego frameworka agentowego i bez bezpośrednich wywołań API modeli.

Spec: [zaakceptowana specyfikacja](../specs/2026-11-09-subscription-fallback-design.md).

## Global constraints

- Kolejność usług: Claude, Codex, Grok, Google; identyfikatory `claude`, `codex`, `grok`, `antigravity`.
- Abonamenty są jedynym sposobem rozliczenia tej funkcji. Nie czytać ani kopiować tokenów OAuth; klucze API nie mogą być cichym zastępstwem logowania.
- Rozmowy już trwające pozostają na obecnej usłudze do wyczerpania limitu. Ręczne wskazanie modelu wybiera usługę początkową; przypięte konta nie przełączają się.
- Jeden cykl próbuje najwyżej każdego uprawnionego konta raz. Reset znany: bufor jednej minuty. Reset nieznany: 30 minut.
- Zachować folder, uprawnienia, identyfikator rozmowy i pierwszeństwo wiadomości użytkownika. Brak obsługi ograniczeń nie oznacza zgody na pełne uprawnienia.
- Funkcja jako eksperyment `subscriptionFallback`, domyślnie wyłączony. Włączenie u Michała dopiero po sprawdzeniu; bez automatycznych aktualizacji nowych CLI.
- Testy rzeczywiste: najtańszy dostępny model, mały prompt, katalog pod systemowym TMPDIR i osobny runner. Nie wyczerpywać limitów celowo.
- Repo to fork Michała. Nie używać maszyn autora upstream. Nie restartować działającego runnera ani aplikacji. Landing przez `tb land`.

## Review focus

1. Limit i nowa wiadomość przychodzą razem: wiadomość nie ginie ani nie jest dublowana. Test w zadaniu 6.
2. Restart między zapisem wyboru a startem CLI: wznowienie nie uruchamia drugiego agenta. Test w zadaniu 6.
3. Częściowa linia JSON, nieznane zdarzenie lub zerwane wyjście CLI: brak fałszywego sukcesu. Testy w zadaniach 3 i 4.
4. Odziedziczony klucz API i utracone logowanie: brak płatnego przejścia na API. Testy w zadaniach 2-4.
5. Starszy klient lub wyłączony eksperyment przy istniejącym wątku Groka: historia nadal czytelna, bez błędnego oznaczenia jako Claude. Test w zadaniu 7.

## Mapa plików i odpowiedzialności

| Obszar | Pliki |
| --- | --- |
| Kontrakt usług i możliwości | `docs/protocol.md`, `runner/src/protocol.ts`, `runner/src/adapters/types.ts` |
| Dostępność kont abonamentowych | nowe `runner/src/subscription-accounts.ts`, `runner/src/subscription-env.ts`; istniejące `accounts.ts`, `config.ts`, `main.ts` |
| Grok | nowe `runner/src/adapters/grok/adapter.ts`, `normalize.ts`, `surface.ts` |
| Google | nowe `runner/src/adapters/antigravity/adapter.ts`, `normalize.ts`, `surface.ts` |
| Wybór i trwały cykl | nowe `runner/src/subscription-fallback.ts`; istniejące `pools.ts`, `store.ts`, `runner.ts`, `runner/pools.ts`, `handoff-history.ts` |
| Nazwy w klientach | `app/Sources/ThreadbearCore/Threads/ModelPicker.swift`, `AccountUsageText.swift`, `ComposerChips.swift`, `SidebarRow.swift`; `ios/ThreadbearKit/Sources/ThreadbearKit/Models.swift`; `web/src/format.ts` |
| Synchronizacja | `runner/src/shared-pools.ts`, `runner/src/sync.ts`, `convex/schema.ts`, `convex/sync.ts`, `convex/phone.ts` |
| Wdrożenie i przewodnik | `runner/src/experiments/subscriptionFallback.md`, `docs/experiments.md`, `docs/guide.md`, `docs/on-your-mac.md`, `docs/forking.md` |

Nowe pliki mają pojedynczą odpowiedzialność. Nie przenosić istniejących integracji Claude/Codex do nowej abstrakcji. Dokładne formaty CLI ustala zadanie 1; nie zgadywać ich z podobieństwa do Claude.

### Task 1: potwierdzić kontrakt obu oficjalnych CLI

Files: utworzyć `docs/superpowers/evidence/2026-11-09-subscription-cli-contracts.md`; syntetyczne przykłady w `runner/test/fixtures/subscriptions/`. Prywatne odpowiedzi i metadane kont zostają poza Git.
Interfaces: wynik to udokumentowany kontrakt dla każdego CLI: wersja, tryb abonamentowy, start/wznowienie, wejście i wyjście, MCP, zgody, przerwanie, błędy limitu. Ten wynik zasila zadania 2-4.

- [x] Odtworzyć brakujące zależności wskazane przez `deps-check` (`relay/npm ci` przed testami); potwierdzić czysty checkout i stan bazowy właściwych testów. Sprawdzić tożsamości kont oficjalnym statusem CLI; nie czytać plików poświadczeń. Grok wcześniej zgłosił brak logowania. Gdy potrzebna jest interakcja człowieka, przygotować oficjalny login i przekazać wyłącznie tę czynność.
- [x] Z lokalnej pomocy i dokumentacji dostawców ustalić transport. Sprawdzić Grok `streaming-json`/ACP oraz Antigravity `stream-json`, bez zakładania obsługi wejścia dwukierunkowego. Zapisać dokładne polecenia, wersje i formaty w dokumencie dowodowym.
- [x] W izolowanym katalogu wykonać minimalną próbę odpowiedzi, kolejnej wiadomości we wznowionej sesji, jednego narzędzia MCP i przerwania. Przetestować zgody i ograniczenia folderu, które CLI rzeczywiście udostępnia. Zweryfikować brak użycia klucza API bez wypisywania wartości.
- [x] Oznaczyć osobno `PASS`, `FAIL` lub `UNVERIFIED` dla każdej możliwości. Brak potwierdzonego abonamentu, MCP albo bezpiecznego wznowienia blokuje aktywowanie danej integracji. Inne zadania niewymagające tego wyniku mogą trwać; nie zastępować brakującej możliwości API.
- [x] Zacommitować dokument i wyłącznie syntetyczne przykłady: `docs: record subscription CLI contracts`. Jeżeli wynik przeczy specyfikacji, opisać konkretną różnicę przed zmianą projektu.

### Task 2: kontrakt usług, kont i możliwości

Files: kontrakt protokołu i możliwości z mapy; nowe pliki `subscription-accounts.ts`, `subscription-env.ts`; `runner/test/unit/subscription-accounts.test.ts`, `runner/test/unit/subscription-env.test.ts`, `runner/test/unit/runner-providers.test.ts`.
Interfaces: `SubscriptionProvider = 'grok' | 'antigravity'`; `SubscriptionStatus = { state: 'ready' | 'loginRequired' | 'unknown' | 'unavailable'; identity?: string; plan?: string; reason?: string }`. `SubscriptionAccountProbe.status(account: Account): Promise<SubscriptionStatus>`. Opcjonalne `AgentAdapter.supports(opts: StartSessionOptions): { ok: boolean; reason?: string }`. Opcjonalne `TurnResult.limit?: { scope: 'account' | 'model'; model?: string; resetsAt?: string }` przenosi wyłącznie potwierdzony zakres limitu z CLI; brak metadanych zachowuje dotychczasową klasyfikację istniejących integracji. `subscriptionEnv(provider: SubscriptionProvider, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv` zwraca kopię środowiska bez dróg uwierzytelniania API wykazanych w zadaniu 1.

- [x] Najpierw rozszerzyć `docs/protocol.md`, potem napisać testy: `assert.equal(isProvider('grok'), true)`, analogicznie `antigravity`; `assert.equal(status.state, 'loginRequired')` dla braku logowania; `assert.equal(cleaned.XAI_API_KEY, undefined)` przy niezmienionym wejściowym środowisku. Analogiczne asercje dla wszystkich źródeł API Google wykazanych w kontrakcie.
- [x] Uruchomić `cd runner && node --test test/unit/subscription-accounts.test.ts test/unit/subscription-env.test.ts test/unit/runner-providers.test.ts`; nowe asercje muszą najpierw zawieść.
- [x] Dodać nowe wartości `Provider`, opcjonalne ścieżki `grokPath` i `antigravityPath` w konfiguracji oraz sondy metadanych kont. Zachować synchroniczne `discoverAccounts`; wynik asynchronicznej sondy trzymać w pamięci i publikować przez istniejący mechanizm aktualizacji kont. Tylko `ready` kwalifikuje nowe konta do automatycznej puli; katalog modeli nie zmienia stanu na `ready`.
- [x] Powtórzyć komendę: wszystkie testy PASS. Sprawdzić, że brak opcjonalnej metody `supports` nie zmienia zachowania starych integracji. Commit `feat: describe subscription providers and account readiness`.

### Task 3: integracja Grok Build

Files: trzy nowe pliki `adapters/grok/` z mapy, `runner/test/unit/grok-adapter.test.ts`, `runner/test/helpers/fake-grok.ts`. Rejestracja w `main.ts` pozostaje wyłączona do zadania 8.
Interfaces: `GrokAdapter implements AgentAdapter`, `provider = 'grok'`; `start(opts: StartSessionOptions, sink: SessionSink): AgentSession`, `models(account: Account): Promise<ModelChoice[]>`. `GrokNormalizer.push(chunk: string): AdapterOutput[]` i `finish(): AdapterOutput[]` oddzielają transport od normalizacji; `surface.ts` buduje argumenty i konfigurację MCP według zadania 1.

- [x] Napisać testy z fałszywym procesem: pocięte linie dają jeden wynik (`assert.equal(results.length, 1)`), wynik limitu ma `errorKind === 'usageLimit'`, odmowa i samo 429 nie mają tego rodzaju, wznowienie zachowuje `nativeSessionId`, przerwanie nie daje sukcesu. Test MCP musi wykonać narzędzie przez ten sam router wątku, a nie samą funkcję normalizującą.
- [x] Uruchomić `cd runner && node --test test/unit/grok-adapter.test.ts` i potwierdzić FAIL przed implementacją.
- [x] Zaimplementować interfejs oraz cykl życia procesu według kontraktu. Użyć istniejącego rejestru procesów. Wynik końcowy wydawać tylko po zdarzeniu końcowym CLI; EOF bez niego jest błędem. Zmiany modelu/trybu, których nie można stosować w locie, zaczynają kolejną turę. Nie przekazywać reguł uprawnień Claude do Groka. Nieobsługiwane ograniczenia odrzuca `supports`.
- [x] Powtórzyć testy: PASS, także brak niejawnego API i brak wykonania narzędzia po odmowie. Commit `feat: add Grok Build subscription adapter`.

### Task 4: integracja Google Antigravity

Files: trzy nowe pliki `adapters/antigravity/` z mapy, `runner/test/unit/antigravity-adapter.test.ts`, `runner/test/helpers/fake-antigravity.ts`.
Interfaces: `AntigravityAdapter implements AgentAdapter`, `provider = 'antigravity'`; sygnatury `start` i `models` jak w zadaniu 3. `AntigravityNormalizer.push(chunk: string): AdapterOutput[]`, `finish(): AdapterOutput[]`; `surface.ts` według własnego kontraktu CLI.

- [x] Napisać testy: `assert.ok(models.every(m => m.model.startsWith('gemini-')))`; wznowienie, narzędzie MCP, odmowa narzędzia, częściowy JSON, nieznane zdarzenie, limit, przerwanie i EOF bez wyniku mają te same wymagania co w zadaniu 3. Test nieznanego modelu zachowuje jego ID, ale nie uruchamia modelu spoza katalogu danego konta.
- [x] Uruchomić `cd runner && node --test test/unit/antigravity-adapter.test.ts`; potwierdzić FAIL.
- [x] Zaimplementować oficjalny proces `agy`, konfigurację MCP i sesje zgodnie z zadaniem 1. Nie używać wycofanej ścieżki konsumenckiej Gemini CLI. Obsłużyć `settingsApplyNextTurn` i brak możliwości zmiany ograniczeń w locie przez zamknięcie sesji przed następną turą.
- [x] Powtórzyć testy: PASS, także zabezpieczenie przed API. Commit `feat: add Google Antigravity subscription adapter`.

### Task 5: deterministyczny wybór kolejnego konta

Files: nowy `runner/src/subscription-fallback.ts`, `runner/test/unit/subscription-fallback.test.ts`; `runner/src/pools.ts`.
Interfaces: `FallbackCycle = { id: string; sourceTurnId: string; attemptedAccountIds: string[]; pending?: { accountId: string; turnId: string; phase: 'queued' | 'started' } }`. `FallbackChoice = { kind: 'move'; accountId: string } | { kind: 'wait'; until: string } | { kind: 'blocked'; reasons: string[] }`. `chooseSubscriptionFallback(pool: Pool, accounts: Account[], current: { accountId: string; provider: Provider }, cycle: FallbackCycle, eligible: (account: Account) => { ok: boolean; reason?: string; retryAt?: string }, now: number): FallbackChoice`. Funkcja `eligible` zamyka w swoim kontekście planowany model i uprawnienia dla danej usługi; sama funkcja wyboru nie wybiera innego modelu.

- [x] Napisać testy czystej funkcji: przy kolejno zablokowanych kontach `assert.deepEqual(chosenProviders, ['codex', 'grok', 'antigravity'])`; brak logowania Groka daje Google; konto odwiedzone nie wraca; najpierw alternatywne konto tej samej usługi, potem kolejność puli. Przy samych błędach logowania `assert.equal(choice.kind, 'blocked')`; przy limitach reset + 60000 ms lub `now + 1800000`.
- [x] Uruchomić `cd runner && node --test test/unit/subscription-fallback.test.ts`; potwierdzić FAIL.
- [x] Zaimplementować funkcję przez istniejące `pickInPool` i reguły dostępności. Kolejność pochodzi z puli, nie z globalnego porządku typów. Filtrować odwiedzone konta i wymagane możliwości przed wyborem. Rozróżnić limit całego konta od modelowego: blokada modelowa wyłącza tę parę konto/model, bez oznaczania całego konta jako wyczerpane.
- [x] Powtórzyć testy oraz `node --test test/unit/pools.test.ts`: PASS. Commit `feat: select subscription fallback without revisiting accounts`.

### Task 6: trwała kontynuacja i przekazanie kontekstu

Files: `runner/src/store.ts`, `runner/src/runner/pools.ts`, `runner/src/runner.ts`, `runner/src/handoff-history.ts`; `runner/test/unit/runner-pools.test.ts`, `runner/test/unit/provider-switch.test.ts`, `runner/test/unit/store.test.ts`, `runner/test/helpers/fakes.ts`.
Interfaces: opcjonalne `ThreadRecord.fallbackCycle?: FallbackCycle` oraz `ThreadRecord.subscriptionModelBlocks?: { accountId: string; model: string; until: string }[]`; wybór z zadania 5. Blokady modeli wygasają według `TurnResult.limit.resetsAt`, a bez niego po 30 minutach; stan ten filtruje `eligible`, które przekazuje termin przez `retryAt`, i wyznacza oczekiwanie dla dotkniętej rozmowy. Istniejące `onUsageLimit`, `moveLogin`, `carryOn`, `startWait`, `endWait` pozostają punktami wejścia. Nowa ścieżka działa wyłącznie pod eksperymentem; stara pozostaje poza nim.

- [x] Rozszerzyć fake adapters do czterech usług. Napisać testy: limit trzech usług przenosi do czwartej z tym samym `thread.id`; podwójne zdarzenie limitu daje `assert.equal(continuations.length, 1)`; restart przed startem CLI nie dubluje kontynuacji; błąd zapisu nie uruchamia nowego procesu. Nowa wiadomość wyprzedza kontynuację i pojawia się raz. Stop usuwa oczekującą kontynuację. Udana tura kończy cykl, ale nie przestawia konta.
- [x] Uruchomić `cd runner && node --test test/unit/runner-pools.test.ts test/unit/provider-switch.test.ts test/unit/store.test.ts`; nowe testy muszą zawieść.
- [x] Zapisać cykl i kolejkę z identyfikatorem kontynuacji w jednym rekordzie przed wywołaniem CLI. Wyjście błędnego procesu musi być potwierdzone przed startem następnego. Przy odzyskiwaniu fazy `started` najpierw sprawdzić istniejącą sesję; nie wysyłać ponownie tej samej wiadomości w ciemno. Zachować obecne zasady restartu i zakończenia tury. Powiadomienie o limicie modelowym nie może wywołać obecnego `markRanDry` dla całego konta.
- [x] Uzupełnić notatkę przekazania o przerwany krok i sprawdzenie skutków ostatniej operacji. Test sprawdza obecność celu oraz ostrzeżenia o nieznanym wyniku, a licznik fałszywego narzędzia z poprzedniej tury pozostaje równy 1. Brak kopiowania pełnych sekretów, narzędzi ani pierwotnej wiadomości jako nowego zadania.
- [x] Powtórzyć testy: PASS. Dodać przypadki wyczerpania wszystkich kont, restartu oczekiwania, resetu i przypiętego konta. Commit `feat: persist subscription recovery and resume once`.

### Task 7: nazwy usług i zgodność klientów

Files: pliki klientów i synchronizacji z mapy, `app/Sources/ThreadbearCore/Protocol/Models.swift`; testy `app/Tests/ThreadbearCoreTests/ModelsTests.swift`, nowe `ios/ThreadbearKit/Tests/ThreadbearKitTests/SubscriptionProvidersTests.swift`, `web/src/format.test.ts`, `runner/test/unit/sync.test.ts`, `runner/test/unit/shared-pools.test.ts`.
Interfaces: zachować `provider` jako string w klientach/Convex. Istniejące `modelLabel(provider?: string, model?: string): string` ma zwracać Grok i Google (Antigravity) przy braku nazwy modelu; dla nieznanej usługi jej ID. Nie dodawać nowego ekranu.

- [x] Napisać testy dekodowania kont i wątków dla `grok`, `antigravity` i nieznanego `future-provider`. Asercje web: `assert.equal(modelLabel('grok'), 'Grok')`, `assert.equal(modelLabel('antigravity'), 'Google (Antigravity)')`, `assert.equal(modelLabel('future-provider'), 'future-provider')`. Sprawdzić zachowanie kolejności czterech usług po synchronizacji i odczycie puli.
- [x] Uruchomić testy przed zmianą: `node --test web/src/format.test.ts`; w runnerze `node --test test/unit/sync.test.ts test/unit/shared-pools.test.ts`; w app `swift test --filter ModelsTests`; w ios/ThreadbearKit `swift test --filter SubscriptionProvidersTests`. Oczekiwane nowe asercje FAIL; błąd środowiska oznaczyć oddzielnie.
- [x] Uzupełnić nazwy w istniejących menu i usunąć założenia „wszystko poza Codex to Claude”. Zachować tolerancję protokołu i dotychczasowe dane. Testy regresji istniejących usług muszą przejść. Jeżeli wymagane są zmiany interakcji, zachować istniejące spinnery i tooltipy.
- [ ] Powtórzyć testy: PASS. W debug app załadować syntetyczne konta i wątki, sprawdzić `dump` oraz screenshot okna bez podnoszenia go na pierwszy plan. Wyłączyć własną instancję. Commit `feat: display subscription providers across clients`.

### Task 8: rejestracja, odbiór i uruchomienie u Michała

Files: `runner/src/main.ts`, `runner/src/config.ts`, `runner/src/runner.ts`, `runner/src/net-probe.ts`, eksperyment i dokumentacja z mapy; nowe `runner/test/unit/subscription-registration.test.ts`, `runner/test/e2e/subscription-handoff.test.ts`.
Interfaces: `experimentOn(home, 'subscriptionFallback')` steruje rejestracją i wyborem nowych usług. Konta spoza aktywnej konfiguracji pozostają czytelne w historii. Oficjalne hosty do sprawdzania sieci wynikają z kontraktu zadania 1, bez zgadywania endpointów.

- [x] Test najpierw: eksperyment off nie uruchamia Groka/Google, ale odczytuje ich zapisane wątki; on rejestruje tylko dostępne, potwierdzone integracje. Testy konfiguracji nie zmieniają rzeczywistego `runner.json`. Uruchomić `cd runner && node --test test/unit/subscription-registration.test.ts` i potwierdzić FAIL.
- [x] Podłączyć integracje, metadane i sondy dostępności. Dodać eksperyment z domyślnym `on: false`. Utworzyć przypomnienie na cztery dni po planowanym wdrożeniu i wpisać otrzymany identyfikator do `reminder`; jeżeli wdrożenie się opóźni, przesunąć termin. Uzupełnić guide/on-your-mac/forking, uruchomić `npm run experiment-docs` w runnerze. Sprawdzić budżet kontekstu; aktualizować go wyłącznie, jeśli zmienią się przekazywane instrukcje/narzędzia.
- [x] Testy rejestracji i eksperymentów PASS. W osobnym dev runnerze wykonać minimalny test każdej zalogowanej integracji, MCP, wznowienia i przerwania; limit zasymulować w harnessie. Dowody opisać osobno jako syntetyczne i rzeczywiste. Zatrzymać własny dev runner przed końcem pracy. Nie nazywać integracji gotową, gdy wykonano tylko testy syntetyczne.
- [ ] Uruchomić `./check.sh --quick` i `./check.sh --app`, właściwe kontrole Convex/web oraz iOS. Sprawdzić lokalne możliwości Xcode; niedostępny test jest `UNVERIFIED`, nie PASS. Wykonać niezależny przegląd zgodnie z wybraną metodą pracy; poprawić ustalenia i powtórzyć dotyczące ich testy. Commit `feat: gate and document subscription fallback`.
- [ ] Po sprawdzeniu wykonać `tb land`. Zachować kopię ustawień pul do wycofania; zapisać przez RPC istniejące pule z potwierdzonymi kontami w kolejności Claude, Codex, Grok, Google i ustawić pulę automatyczną dla nowych wątków. Włączyć eksperyment dopiero na wydaniu, które go zawiera. Odczytać konfigurację ponownie. Zmiana nie przerywa aktywnych tur. Jeśli potrzebny deploy Convex/web, użyć potwierdzonego projektu Michała i osobno odnotować jego wynik.
- [ ] Sprawdzić wydanie działającego runnera i aplikacji po automatycznej aktualizacji. Gdy zmieniono iOS, wykonać właściwą instalację na telefonie zgodnie z instrukcjami repo; brak możliwości instalacji zgłosić jako ograniczenie. Wycofanie: wyłączyć eksperyment, przywrócić poprzednie pule, zachować historię. Zaktualizować README w kontekście ScaleX, projekt Threadbear, zadanie Linear i pmlog; oddać pożyczony checkout dopiero po przeniesieniu wątku i scaleniu zmian.

## Warunek zakończenia i stan planu

Gotowe oznacza sprawdzone rzeczywiste sesje abonamentowe obu nowych usług, test przejścia przez cztery konta z zachowaniem kontekstu oraz wdrożenie potwierdzone odczytem wersji i ustawień. Nie ma obowiązku wywoływania rzeczywistego limitu. Jeżeli jednej usługi nie można uruchomić, pozostała część może być zapisana i sprawdzona, ale cały zakres pozostaje częściowy.

Plan przygotowany 09.11.2026 na bazie `6c6c3943`; zaakceptowany do wykonania w tym wątku. Implementacja: `cb2d2d7a` do `2319ce89`. Zadanie: [SCL-412](https://linear.app/sclaex/issue/SCL-412). Stan weryfikacji i odstępstwa opisuje [raport wykonania](../evidence/2026-11-09-subscription-implementation.md). Przed uruchomieniem pozostają końcowy check, landing i odczyt ustawień działającego wydania. XCTest oraz Testing są niedostępne w lokalnym CommandLineTools; nie oznaczamy tych testów jako PASS.
