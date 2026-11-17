# 03 - Threadbear od środka: co jest pod koordynatora, co da się dobudować, czego brakuje

Stan na 17.11.2026. Kod: fork Michała, `main` = `d85002fa` (ostatnie wydanie Mike'a wciągnięte 16.11, baza `f4d6ca75`). Upstream (`upstream/main` = `a3f97e33`) jest 270 commitów do przodu. Odwołania `plik:linia` dotyczą forka, chyba że zaznaczono `upstream`. Kod w `runner/src`, aplikacja GPUI w `desktop/`, zamrożona Swift w `app/`.

Dziś koordynator to prompt: `~/.agents/skills/koordynator/SKILL.md` plus chip `~/.threadbear/patches/koordynator.ts`. Włączone eksperymenty (runner.json): `nestedThreads`, `quietInbox`, `looseEnds`, `projectDecisions`, `sameWork` (oraz `subscriptionFallback`, `selfReinstall`).

## 0. Najważniejsze w skrócie

1. Fundament jest solidny i stabilny: `create_thread` + `end_turn({ waitFor })` + `send_message` + `read_thread`. To wystarcza na pętlę „rozdziel - śpij - obudź się z raportami”.
2. W playbooku jest błąd: `waitFor` nie budzi koordynatora, gdy wątek padnie, zostanie zatrzymany albo skończy z `needs: "you"`. Budzi tylko „czysty” koniec (`needs: "nothing"`) albo archiwizacja. Bez `snooze` koordynator śpi wtedy do 24 h.
3. `waitFor` czeka na wszystkie wątki naraz (maks. 5). Nie ma trybu „obudź przy pierwszym”, więc nie da się puścić kolejnego zadania, gdy jedno się skończy.
4. Mike 16.11 wyłączył u siebie `nestedThreads`, bo „przemyśla koordynatorów”, i usunął zasadę hibernowania startera z `quietInbox`. Kierunek upstreamu jest ruchomy: nie budujmy na wstrzymywanych raportach (`heldReports`).
5. Najwięcej da się zrobić bez forka: patch z panelem listy i badge'em, który czyta stan wątków przez `tb list --all --json` (działa z uprawnieniami właściciela), plus `schedule_message` z `check` jako tani strażnik zawieszonych wątków.
6. Brakujące klocki w kodzie są małe: link do wątku z wiersza panelu (GPUI, kilkanaście linii), `waitFor` z budzeniem na błąd / `needs you` / „any” (runner, mały), filtr „moje wątki” w `list_threads`. To raczej propozycje do Mike'a niż zmiany w forku.

## 1. Co już jest i jak działa

### 1.1 Delegacja: `create_thread`

- Definicja: `runner/src/threadbear-mcp.ts:1846-1868`. Parametry: `text` (brief), `title`, `folder`, `pool`/`account`, `model`, `effort`, `permissionMode` (`full`/`ask`/`auto`), `why` (kilka słów do dymka w sidebarze), `runner` (inna maszyna), `nested` (domyślnie `true`, `false` = nie wisi pod starterem, `threadbear-mcp.ts:1866`).
- Nowy wątek dostaje `startedBy: { kind: "thread", threadId, why }`; to podstawa nesting, „Started by” i „Threads it started”.
- Wątek z niższym trybem niż starter dziedziczy tryb startera; wyższy wymaga karty zgody (`threadbear-mcp.ts:1872-1878`).
- `tb new` z powłoki wątku też ustawia `startedBy` (`runner/src/cli.ts:443`, `started-by-flags.ts`).

### 1.2 Raporty i budzenie: `end_turn({ waitFor })`

- Parsowanie: `runner/src/needs.ts:171-192`. `MAX_WAIT_FOR = 5` (`needs.ts:173`), każdy element to id albo `{ thread, until }` (`until` maks. 200 znaków). Działa tylko z `needs: "nothing"`.
- Hibernacja: `waitOn` w `runner/src/runner/hibernation.ts:157-204`. Bez `snooze` budzi najpóźniej po dobie (`WAIT_FOR_DEFAULT_MS`, `hibernation.ts:32`). Wątek zarchiwizowany albo nieznany jest pomijany z notatką.
- Kiedy wątek „skończył”: `runner/src/runner.ts:2726-2729`. Warunki: tura `completed`, `needs: "nothing"`, pusta kolejka, brak archive/snooze/waitFor własnego, brak działających sub-agentów, zadań w tle i kart. Dopiero wtedy `markFinished` zapisuje `finished.reply` (`hibernation.ts:219-232`).
- Sprawdzanie: `reconcileWaitsOf` (`hibernation.ts:266-283`) liczy wątek jako gotowy tylko przy `finished` albo `archivedAt`; budzi, gdy `waits.every(x => x.done)` (`hibernation.ts:282`).
- Pobudka: `deliverWaits` (`hibernation.ts:322-360`) wysyła wiadomość od runnera z ostatnią odpowiedzią każdego wątku, przyciętą do 2000 znaków (`WAIT_FOR_REPLY_CHARS`, `hibernation.ts:34`). Wątek z niższym dostępem niż czekający: raport nie trafia do agenta, tylko do Michała (`hibernation.ts:327-338`).
- `until` + bibliotekarz: czekanie, aż wątek „zrobi X”. Bibliotekarz (mały model) ocenia po każdej zakończonej turze i daje werdykt `{met, why}`; liczy się tylko `met: true` (docs/protocol.md:5281-5288, `waitMet` w `hibernation.ts:414-430`). Prywatny folder nie dostaje oceny.
- Wiadomość od Michała do śpiącego koordynatora budzi go (każda wiadomość budzi hibernację).

Wniosek dla playbooka: zdanie „Jeśli któryś wątek padnie albo zostanie zatrzymany, dostaniesz go od razu” jest prawdziwe tylko dla raportów wstrzymanych przez `nestedThreads` (`runner.ts:2741`, `nested.ts:95-102`). Gdy dziecko nie wysłało żadnego `send_message`, padnięcie nie budzi `waitFor`. To samo, gdy dziecko kończy pytaniem do Michała (`needs: "you"`) albo czeka na kartę zgody / `ask_secret`.

### 1.3 Wstrzymywanie raportów (`nestedThreads`, runner)

- `runner/src/runner/nested.ts`. `holdReport` (`nested.ts:57-75`): `send_message` dziecka do startera jest odkładany do `rec.heldReports`, gdy starter jest między turami, a któreś z jego dzieci jeszcze pracuje. Rozpoznanie nadawcy po pierwszej linii `[Sent by the agent in the thread "…" (<id8>)]` (`nested.ts:31-35`).
- Doręczenie: razem, gdy żadne dziecko nie pracuje, albo od razu, gdy jedno padło lub zostało zatrzymane (`settleHeld`, `nested.ts:93-102`). Pobudka z `waitFor` zabiera je ze sobą (`hibernation.ts:354-358`). Przeżywa restart (`settleAllHeld`, `nested.ts:120-123`).
- Pracuje = tura, kolejka, zadania w tle albo sub-agent (`stillWorking`, `nested.ts:50-52`); czekanie na Michała, kartę albo hibernacja to nie praca.
- Ograniczenia: tylko `send_message`, bez obrazków; nie dotyczy wątków `detached`; tylko ten sam runner.

### 1.4 Cicha skrzynka (`quietInbox`)

- `runner/src/runner/quiet-inbox.ts`, wołane z `runner.ts:2788`. Dwie reguły:
  - pomocnik startowany przez inny wątek, którego Michał nie dotknął (`helperNobodyTouched`, `quiet-inbox.ts:79-90`), bez otwartych spraw i bez propozycji `next`, archiwizuje się z notatką (`quiet-inbox.ts:70-73`);
  - wątek, którego jedyne otwarte sprawy to jego dzieci, sam hibernuje na nich jak `waitFor` (`quiet-inbox.ts:56-66`, wake z `quiet: true`).
- Upstream (2ac84459, 16.11): pierwsza reguła jest standardem, druga usunięta, bo „re-hibernowała oznaczonego gwiazdką koordynatora 89 razy dziennie”. Po wciągnięciu wydania klucz `quietInbox` w runner.json przestanie działać, a koordynator kończący turę bez `waitFor` zostanie w Inboxie.

### 1.5 Grupowanie w sidebarze (GPUI)

- Sekcje są statusowe (Starred, Inbox, Running, Hibernating, Archived), nie folderowe: `desktop/core/src/inbox.rs:610-621`; wybór wariantu z zagnieżdżeniem: `desktop/gpui/src/app.rs:1708-1732`.
- Zasady zagnieżdżenia: `desktop/core/src/nested.rs`. Jeden poziom (wnuk idzie pod najwyższego startera, `nested.rs:48-67`). Grupa idzie do sekcji najpilniejszego członka: Inbox, gdy ktoś czeka na Michała, Running, gdy ktoś pracuje (`nested.rs:146-156`). Wiersz startera: „· 1 needs you · 5 working” / „N finished” (`nested.rs:197-214`). Grupa sama się otwiera, gdy dziecko czeka na Michała (`nested.rs:240-247`).
- Render: `desktop/gpui/src/sidebar.rs:1336-1347` (sub-agenci i dzieci pod wierszem), `render_group` `sidebar.rs:1861-1896`, menu „Move Out From Under / Put Back Under” (`nested.rs:310-324`). Drag in/out niezrobiony.
- Druga linia dziecka: jego otwarte pytanie (pomarańczowe), inaczej `startedBy.why`, inaczej ostatnia odpowiedź (`nested.rs:259-267`).
- Hibernujący wiersz z `waitingOn`: „Waiting on "X" and N more” (`desktop/core/src/sidebar.rs:460-476`). Aplikacja nie czyta `heldReports` ani flagi `quiet`.
- Pasek „Started by <link> · why” nad transkryptem dziecka: `desktop/gpui/src/thread.rs:380-400`.
- Widok Projects też zagnieżdża, ale tylko gdy starter jest w tym samym projekcie (`desktop/gpui/src/projects_list.rs:142-173`).
- Bez `nestedThreads` nic się nie zagnieżdża; wiersz ma tylko ikonę łapki (pawprint) dla wątków startowanych przez agenta.
- Swift (`app/`): bez zagnieżdżenia, tylko byline (`app/Sources/ThreadbearCore/Threads/SidebarRow.swift:247-260`). Telefon i web: brak zagnieżdżenia, bo `startedBy` w schemacie Convex nie ma `threadId` (`convex/schema.ts:60`, `:311`).

### 1.6 „Threads it started” w Highlights

- Gotowy widok pracy koordynatora per wątek: `desktop/gpui/src/highlights.rs:1462-1500`, logika `desktop/core/src/highlights.rs:725-841`. Stany: Needs you, Failed, Working, Hibernating, Done, Archived; dodatkowo wątki z `waitingOn`, których nie startował („Waiting on it ·”). Swift ma to samo (`app/Sources/ThreadbearCore/Threads/StartedThreadRows.swift`, komentarz: „light take on Ghostex's coordinators”).

### 1.7 Decyzje projektu (`projectDecisions`)

- Tylko aplikacja, runner nic nie trzyma (`runner/src/experiments/projectDecisions.md`). Wątek jest decyzją, gdy `needs: "you"`, nie jest zajęty i ma `asksSeq` z nieodhaczonym ask (docs/protocol.md:5214-5220). Odpowiedź z zakładki Decisions to zwykły `threads.send`, identyczny z odpowiedzią w wątku.
- GPUI: `desktop/gpui/src/project_decisions.rs`, zakładki w `project_page.rs`. Check-in u Mike'a 24.11 (5f45001a).
- Dla koordynatora: pytania zadane przez koordynatora w jego `asks` pojawiają się w Decisions jego projektu; pytania dzieci też, jeśli są w projekcie. To jest wariant „bez przekazywania przez koordynatora” (Ghostex-owy kierunek A, który Mike wybrał 10.11).

### 1.8 Karty asks, show_options, przypinki, panele

- `asks` w `end_turn` (`needs.ts:695-696` opisuje kształt): 2-4 opcje, `suggested`, `links`. Upstream 0814b8ea (17.11): ask może linkować wątek `thread:<id>`, a ask wskazujący wątek bez opcji i linku jest odrzucany. W forku jeszcze tego nie ma.
- `show_options` (`threadbear-mcp.ts:647`): okno przeglądu wariantów; na telefonie tylko podgląd odpowiedzi, otwiera się na Macu.
- `pin` / `unpin` (`threadbear-mcp.ts:802`, `:825`), `show_panel` (`:837`): otwiera panel patcha, Highlights, Usage itd.
- Reszta narzędzi ważnych dla koordynatora: `list_threads` (`:1740`), `read_thread` (`:1767`), `send_message` (`:1923`), `update_thread` (`:1954`), `interrupt_thread` (`:2112`), `move_thread`, `delete_thread`, projekty (`:1129-1340`), harmonogramy (`:860-1044`).

### 1.9 Inne mechanizmy przydatne koordynatorowi

- Stuck background jobs (`runner/src/stuck-jobs.ts:9-34`, docs/protocol.md:1823): co 5 min sprawdza bezczynne wątki Claude z zadaniami w tle; zadanie > 30 min bez wyjścia i bez CPU dostaje wiadomość do wątku. Dotyczy zadań w tle po zakończonej turze, nie zawieszonej tury.
- Loose ends na karcie końca tury: standard u Mike'a od 16.11 (b9d8159b). Wymienia też wątki startowane, wciąż pracujące.
- `sameWork`: upstream usunął 17.11 (551e3260), bo nie znajdował duplikatów.

## 2. Punkty rozszerzeń bez forka

### 2.1 Skill (już jest)

Prompt nic nie kosztuje przy scalaniu. Do poprawy od razu, w samym SKILL.md:

- Zawsze `waitFor` z `snooze` (np. `"90m"`) jako bicie serca: po pobudce `list_threads` / `tb list`, ocena, ponowne `waitFor`. To łata na brak pobudki przy błędzie i `needs you`.
- Opcjonalnie `waitFor: [{ thread, until: "skończył zadanie albo zatrzymał się z pytaniem do użytkownika" }]`: bibliotekarz oceni też turę z `needs: "you"`. Minus: zwykły koniec też idzie przez ocenę modelu (wolniej, może się mylić), a zatrzymana/padnięta tura nie jest „completed”, więc i tak nie budzi.
- Poprawić zdanie o padnięciu wątku (patrz 1.2) i nie opierać się na wstrzymywaniu `send_message` (upstream może je zmienić).
- Stan dzieci bez czytania każdego wątku: `tb list --all --json` z powłoki koordynatora (wątek ma `THREADBEAR_THREAD_KEY`, odczyty są dozwolone, docs/protocol.md:95-120) i filtr `startedBy.threadId == $THREADBEAR_THREAD_ID`. JSON to pełne `ThreadSummary` (`cli.ts:978-982`): `status`, `needsYou`, `asks`, `waitingOn`, `lastSeq`, `lastActivityAt`, `archivedAt`, `startedBy`.

### 2.2 Patch: panel „Praca koordynatora” (sprawdzone w API)

- `items` dostaje `{ cwd, threadId, thread, sh }` (docs/protocol.md:3925-3933). `thread` to `{ title, projects }` (c168328f).
- `sh` uruchamia się z env wątku (`runner/src/runner/patches.ts:434-435`): `THREADBEAR_HOME` i katalog `bin` runnera na PATH (`runner/src/restart.ts:146-166`), ale z pustym `THREADBEAR_THREAD_KEY`, więc `tb` spada do tokena właściciela. Czyli z patcha w `~/.threadbear/patches/` działa `sh("tb list --all --json")` i widać wszystkie wątki. Dla patcha projektu zaufanego hashem `sh` uruchamia tylko to, co obejmuje zaufanie.
- Wiersz (`PanelItem`, `runner/src/protocol.ts:615-626`, sanityzacja `runner/src/patches.ts:1220-1231`): `title` (300 zn.), `detail` (2 linie), `url`, `path`, `icon` (SF Symbol), `tone` (`attention`/`failed`/`done`), `section`, `trailing` (24 zn.). Brak akcji per wiersz.
- Szkic: `when: ({ thread }) => /koordynator/i.test(thread.title)` albo sprawdzenie, czy wątek ma dzieci; `items` = dzieci z `tb list`, sekcje „Czeka na Ciebie / Pracuje / Śpi / Zrobione”, `tone` z `needsYou` / `status === "error"`, `trailing` = czas od `lastActivityAt`, `detail` = pierwsze ask albo `preview`. Do tego pozycje W1… z `state` projektu (`tb projects --json`).
- `badge` na przycisku panelu w szynie (`desktop/gpui/src/rails.rs:451`) albo na chipie: liczba dzieci czekających na Michała. `summary` (do 4 linii) daje kartę na górze Highlights (`desktop/gpui/src/patches.rs:51-85`).
- Odświeżanie: przy każdym odczycie patchy, po każdej turze i co 20 s dla wątku w Inboxie; wspólny cache wyjścia polecenia na folder przez 10 s; limit 10 s na funkcję (docs/protocol.md:3956-3968).
- Ograniczenie: klik w wiersz nie otworzy wątku. `list_row` (`desktop/gpui/src/patches.rs:270-312`) woła `follow_link` z `desktop/gpui/src/highlights.rs:663-683`, które obsługuje tylko `file://` i http(s). `thread:<id>` i `threadbear://thread/<id>` nic nie robią. Brak też badge'a w wierszu sidebaru.

### 2.3 Patch: hook `turn.end`

- Jedyny wyzwalacz to `turn.end` (`runner/src/patches.ts:649`), uruchamiany po turze tego wątku, którego folder pasuje; `tell: "always"` wysyła wynik agentowi i startuje turę (docs/protocol.md:3990-4005). Hook nie ma `when`, więc w `~/.threadbear/patches` odpali się dla każdego wątku; filtrować trzeba w skrypcie (`THREADBEAR_THREAD_ID` jest w env, `runner/src/runner/patches.ts:884`).
- Nie wykryje zawieszonego dziecka (zawieszone nie kończy tury). Nadaje się do: po turze koordynatora sprawdzić, czy lista pracy w `state` projektu się zgadza, albo po turze dziecka dopisać linię do pliku dziennika koordynatora.

### 2.4 Harmonogram: strażnik zawieszonych wątków

- `schedule_message` z `cron` do wątku koordynatora i `check` (`threadbear-mcp.ts:270-276`): skrypt, który nic nie drukuje, pomija uruchomienie i nie budzi agenta; wydruk trafia do wiadomości. Stan w `$THREADBEAR_CHECK_STATE`.
- Env checka to env procesu runnera plus `THREADBEAR_SCHEDULE_ID` i `THREADBEAR_CHECK_STATE` (`runner/src/schedule-check.ts:212`), bez gwarancji `tb` na PATH: wołać pełną ścieżką (`/Users/michalfraczek/threadbear/runner/bin/tb`).
- Wykrycie zawieszenia: `lastActivityAt` zmienia się tylko na granicach tur (10 miejsc w `runner.ts`), więc nie wystarczy. `lastSeq` rośnie z każdym zdarzeniem: check zapisuje `lastSeq` pracujących dzieci i drukuje te, których `lastSeq` stoi np. 30 min. Wiadomość budzi koordynatora (także z hibernacji `waitFor`), a on robi `read_thread` / `interrupt_thread`.
- Koszt: zero tur, gdy wszystko gra. Playbook dziś zabrania `schedule_message` do podglądania; ten wyjątek trzeba dopisać.

### 2.5 Projekt: `state` / `notes` / `notion`

- Limity: `goals` i `state` po 2000 znaków, `notes` 50 000 (`runner/src/projects.ts:104-105`, `:370-401`). `state` wystarcza na listę W1… (ok. 15-25 pozycji jednoliniowych).
- `list_projects` pokazuje pierwszą linię `state` (`threadbear-mcp.ts:1136-1141`); brief wątku w projekcie dostaje cele i stan.
- Tablica zadań to tylko Notion (`notion`, docs/protocol.md:5404-5458, `runner/src/notion-tasks.ts`), z kolumną `Thread` łączącą kartę z wątkiem. Michał prowadzi zadania w Linear; panel Linear już jest jako patch (`~/.threadbear/patches/linear.ts`), ale nie zasila `read_project` ani briefu.

## 3. Luki wymagające zmian w kodzie

| # | Luka | Gdzie | Wielkość | Konflikty przy scalaniu | Do Mike'a? |
|---|------|-------|----------|-------------------------|-----------|
| L1 | `waitFor` nie budzi przy padnięciu / zatrzymaniu / `needs: "you"` dziecka | `reconcileWaitsOf` `hibernation.ts:266-283`, wywołanie z `completeTurn` ok. `runner.ts:2737-2759`; tekst pobudki `deliverWaits` `:339-350`; opis w docs/protocol.md:3379 | mała (30-60 linii + testy + opis narzędzia, czyli `npm run context-budget`) | `runner.ts` 204 commity upstream od 1.11, `hibernation.ts` 29: średnie-wysokie, ale zmiana punktowa | Tak, to błąd w modelu `waitFor` widoczny dla każdego koordynatora |
| L2 | `waitFor` tylko „wszystkie”, maks. 5 | `needs.ts:173-192`, `hibernation.ts:282` (`every`) | mała (parametr `waitFor` w trybie „any” lub `wakeOn: "first"`) | `needs.ts` 44 commity: średnie | Tak |
| L3 | Wiersz panelu listy nie otwiera wątku | `desktop/gpui/src/highlights.rs:663-683` (`follow_link`): dodać `thread:` i `threadbear://thread/` przez istniejące `open_thread_link` z `reply_links.rs:288` | bardzo mała (10-20 linii Rust + spec w `features/`) | `highlights.rs` 40 commitów: niskie, zmiana lokalna | Tak, naturalny PR |
| L4 | `list_threads` bez filtra „moje dzieci” i bez `waitingOn`/ask/headline w linii | `threadbear-mcp.ts:565-569` (`line`), `:1740-1764` | mała, ale rośnie budżet kontekstu (`runner/context-budget.json`) | `threadbear-mcp.ts` 114 commitów: wysokie | Tak; do tego czasu `tb list --json` |
| L5 | Akcje w wierszach panelu (np. „Przerwij”, „Kontynuuj”) | `PanelItem` w `protocol.ts:615`, `panelItem` `patches.ts:1220`, render `desktop/gpui/src/patches.rs:270-312`, docs/protocol.md „Patches” | średnia (protokół + runner + GPUI + parity) | średnie | Tak, ogólna funkcja patchy |
| L6 | Hook bez `when` i tylko `turn.end`; brak wyzwalaczy `thread.finished`, `child.stalled`, cron | `runner/src/patches.ts:649-655`, wykonanie w `runner/src/runner/patches.ts` | średnia | `patches.ts` 30 + 47 commitów: średnie | Tak, ale niski priorytet (harmonogram z `check` pokrywa większość) |
| L7 | Badge / status patcha w wierszu sidebaru | `desktop/gpui/src/sidebar.rs` (72 commity), `ThreadSummary` | średnia | wysokie | Raczej nie: Mike sam przebudowuje sidebar |
| L8 | Zagnieżdżenie i raporty między runnerami (dziecko na `bruce`) | `startedBy` bez `threadId` w Convex (`convex/schema.ts:60`, `:311`), `waitOn` szuka tylko lokalnie (`hibernation.ts:162-176`) | duża (schemat Convex, relay, aplikacje) | wysokie | Tylko jako propozycja |
| L9 | Tablica zadań z Linear zamiast Notion | `runner/src/notion-tasks.ts`, `projects.ts` (`notion`, `tasks`) | średnia-duża | niskie (`projects.ts` 8 commitów), ale to własny moduł do utrzymania | Nie (potrzeba Michała); w forku jako osobny plik albo zostać przy patchu |
| L10 | Wykrywanie zawieszonej tury (nie zadania w tle) przez runner | rozszerzenie `stuck-jobs.ts` o tury bez nowych zdarzeń | średnia | niskie | Tak, pasuje do istniejącego mechanizmu |

Ocena ryzyka dla forka: każda zmiana w `runner.ts`, `threadbear-mcp.ts`, `docs/protocol.md` (464 commity upstream od 1.11) będzie konfliktować przy co drugim wydaniu. Zmiany w forku trzymać w nowych plikach (jak `subscription-*.ts` Michała) i w patchach; resztę zgłaszać Mike'owi jako PR/issue (CONTRIBUTING.md w upstreamie od 17.11 mówi, jak przyjmuje zewnętrzną pracę).

## 4. W którą stronę idzie Mike (git log upstream od 1.11)

- 10.11 `projectDecisions` (kierunek A z jego notatek o Ghostex: pytania zbierane per projekt, bez przekazywania przez koordynatora). Nadal eksperyment, check-in 24.11.
- 12.11 `quietInbox` (e5221ae2), 16.11 standard bez reguły hibernacji startera (2ac84459): koordynator z gwiazdką był hibernowany 89 razy dziennie, a pobudki „rzadko miały coś do powiedzenia”.
- 13.11 `sameWork` (94d25926), 17.11 usunięty (551e3260).
- 13.11 bibliotekarz: `met` tylko przy jawnym `true` (26274cd9, 72dc836c).
- 15.11 `nestedThreads`: runner (b5b3c8e7) i sidebar GPUI (d37fb9a2), po tym, jak „GPUI Port Coordinator” wystartował 25 wątków dziennie i budził się 79 razy, 47 razy tylko po to, żeby powtórzyć raport. 16.11 Mike wyłączył eksperyment u siebie „while he rethinks coordinators” (69d1093b); kod wciąż jest, plik eksperymentu zostaje.
- 16.11 `looseEnds` standard (b9d8159b).
- 16.11 docs/virtual-runners.md (upstream): „Coordinators are a separate experiment and out of scope here”. Zapowiedź osobnego eksperymentu koordynatorów; w kodzie upstreamu go jeszcze nie ma (brak pliku w `runner/src/experiments/`, są: cardReviewer, coldCompact, nestedThreads, projectDecisions, selfReinstall, sharedMemory).
- 17.11 asks z linkiem `thread:<id>` na Macu, telefonie i webie (0814b8ea, aa81e5b5, d009ccb6); „live mark” przed linkiem do wątku w odpowiedzi (14b02e73). Ułatwia koordynatorowi kierowanie Michała do wątku.
- 17.11 `sharedMemory`: pamięć i CLAUDE.md głównego Maca na inne runnery.

Wniosek: Mike szuka formy koordynatora i odcina to, co budziło za często albo ukrywało wątki. Pewne punkty jego kierunku: wątki startowane przez agentów nie zaśmiecają Inboxa, pytania zbiera się per projekt, starter słyszy raporty rzadziej. Niepewne: czy zostanie zagnieżdżenie i wstrzymywanie raportów. Nasz plan nie powinien duplikować sidebaru ani held reports; bezpieczne są: playbook, patch-panel, harmonogram-strażnik i małe PR-y L1-L3.

Do zrobienia przy najbliższym wciągnięciu wydania: z runner.json Michała znikną efekty `quietInbox` (hibernacja koordynatora), `looseEnds` (zostaje jako standard) i `sameWork` (usunięty); notka w system prompcie o „threads that may be about the same thing” też zniknie.

## 5. Czego nie sprawdziłem

- Nie uruchamiałem niczego: patch z `tb list` w `items`, check harmonogramu i pobudka z hibernacji przez `schedule_message` są wywnioskowane z kodu, nie przetestowane.
- Nie czytałem notatek Mike'a `~/dev/me/misc/ghostex-notes/` (są na jego maszynie) ani treści wątków, o których piszą commity.
- Sidebar GPUI, Swift, iOS i web znam z przeglądu kodu przez sub-agenta (odwołania w 1.5, 1.6, 2.2), bez zrzutów ekranu.
- Nie sprawdziłem, czy wiadomość z harmonogramu do wątku w hibernacji `waitFor` czyści `waitingOn` (zakładam, że jak każda wiadomość budzi wątek).
- Nie mierzyłem kosztu `tb list --all --json` przy wielu wątkach (co 20 s na wątek w Inboxie z panelem).
- Codex jako koordynator: nie sprawdzałem różnic (np. stuck-jobs działa tylko dla Claude).
