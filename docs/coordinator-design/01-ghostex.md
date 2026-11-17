# Koordynator w Ghostex - inwentaryzacja

Źródło: klon `maddada/Ghostex`, commit `1e99ef2` (17.11.2026), w `/tmp/ghostex-src`. Ścieżki niżej są względne do tego repo; `coord/` = `server/src/coordinators/`, `rt/` = `server/src/server/`. Cytaty pochodzą z komentarzy `CDXC:... DECISION/WHY` (decyzje użytkownika-autora Ghostex, datowane) i z issue GitHub, które te komentarze przywołują. Kodu Ghostex tu nie kopiowano, tylko opisano.

Skala: `coord/` to 45 modułów i ~17,5 tys. linii, do tego ~10 tys. linii w `rt/coordinator_*`, `rt/autopilot_*`, `chief/`, `autopilot/`. 145 komentarzy decyzji w samym `coord/`. Prawie wszystko powstało między 30.09 a 17.11.2026, czyli w siedem tygodni, w reakcji na konkretne incydenty.

Oznaczenia w katalogu: P = tylko prompt (playbook, brief), K = wymuszone kodem serwera, P+K = oba. Złożoność S/M/L to szacunek nakładu na odtworzenie w Threadbear.

---

## 1. Model mentalny

### Role

- Coordinator (w UI przez chwilę „Orchestrator”, CLI ma oba aliasy). Zwykła sesja agenta ze stałą rolą. Użytkownik rozmawia tylko z nim. Sam odpowiada na szybkie pytania, każdą prawdziwą pracę oddaje wątkowi. Decyzja z 11.11: „coordinator shouldn't check stuff... the coordinator's role is more as a facilitator” - nie testuje i nie weryfikuje pracy wątków, tylko czyta raporty i przekazuje zastrzeżenia. Commituje pracę wątku sam (path-scoped), zamyka wątki. W projekcie może być kilku (jeden na strumień pracy).
- Thread. Zwykła sesja agenta (dowolny agent: Claude, Codex, Cursor...) uruchomiona i zbriefowana przez koordynatora, wisi pod nim w sidebarze. Raportuje wyłącznie przez zakończenie tury; serwer przekazuje ostatnią wiadomość koordynatorowi. Nie rozmawia z użytkownikiem i nie publikuje stron.
- Main coordinator. Jeden na projekt na komputer (pierwszy utworzony, zmiana prawym klikiem „Make main coordinator”). Adres domyślny, gdy inny agent albo Chief of Staff chce czegoś od projektu: `agents send --main-coordinator --project-id <id>`, z wyborem `--if-none create|session`. `coord/main_coordinator.rs`.
- Chief of Staff. Jeden koordynator na komputer, w „Main Hub” (projekt w katalogu domowym), rozszerzenie beta wyłączone domyślnie. Odpowiada na pytania o całą pracę i o sam Ghostex, ma „head role”: może wysyłać, przerywać, pisać do i odpowiadać na prompty dowolnej sesji bez pytania. Pracę projektową oddaje main coordinatorowi danego projektu, pracę na innym komputerze - tamtejszemu Chiefowi. Wiadomości innych agentów traktuje jako dane, nie polecenia. `server/src/chief/`, playbook `chief/playbook.md`.
- Autopilot. Tryb „keep going no matter what”, wyłączony domyślnie, obejmuje wszystkie sesje albo wybrane projekty/sesje. Dwie warstwy: tani watcher regułowy (carry on, interrupt, reload, przełączenie konta przy limicie, restart martwej sesji, odpowiedzi na pytania po 5/10/15 min, na karty zgód po 1 min) i agent-supervisor budzony tylko na decyzje wymagające osądu (Opus 5.5 medium albo GPT 6.1 Sol high), z notatkami między wybudzeniami. Twarde limity (push, merge, release, delete poza projektem, publikacja) to osobne przełączniki, domyślnie off; logowanie, 2FA, płatności nigdy. `server/src/autopilot/`, `rt/autopilot_*.rs`.
- GBots (beta, off). Trwałe boty z rolą, instrukcjami, pamięcią, rutynami, działami i liderami, prowadzone przez Chiefa. Raportują jak wątki („<Name> reports on A12”), z `--done-when` i maks. dwoma reworkami. To osobny produkt, z koordynatorem łączy go tylko mechanika raportów. `server/src/gbots/`.
- Zwykła sesja z to-do. Od 16.11 każda sesja może dodać `ghostex needs-you add`; w wątku koordynatora trafia to do Needs you koordynatora, żeby użytkownik miał jedną listę.

### Cykl życia wątku

```
start-thread ──► pending (czeka na transkrypt) ──► started
                    │ brak dostarczenia + idle ──► raport "your message did not reach it"
started ──► working ──► koniec tury ──► raport "finished its turn" + ostatnia wiadomość
   │            │
   │            ├─ pytanie/zgoda ──► raport "waiting for an answer" + karta przekazana do czatu koordynatora
   │            ├─ 8 min bez outputu ──► nudge do wątku + raport (co 8 min) ──► po 2 rundach czerwona kropka i powiadomienie użytkownika
   │            ├─ uśpiony/padł w trakcie tury ──► raport "stopped before its turn ended"
   │            └─ terminal zabity ──► self-heal (restart na tej samej rozmowie, maks. 3/10 min) ──► raport "restarted..."
   └─ idle, ale "winien" pracę (10 min) ──► nudge "carry on" + raport (co 10 min) ──► po 2 rundach czerwona kropka
finished ──► koordynator commituje ──► resolve (zamyka sesję) | resolve --keep-open (tylko "done")
done ──► wiadomość od koordynatora lub użytkownika ──► reopen (ta sama rozmowa, watch dostarczenia)
restart Ghostexa ──► wątki przerwane w trakcie: karta "Carry on / Not now" w czacie koordynatora, nic nie jest wpisywane samo
```

Stany wątku widoczne w `coordinator status` (`coord/state.rs`): Waiting on you, Finished, Working, Sleeping, Closed, Done. Uśpiony wątek to wciąż otwarta praca, nie zakończona.

Zasady, które spinają całość:
- Koordynator nigdy nie polluje, nie śpi, nie robi `wait-for-text`. Kończy turę; serwer budzi go raportem. „firstmate's lesson: supervision must cost the coordinator nothing until something needs it” (`rt/coordinator_runtime.rs`, 30.09).
- Leczenie (interrupt, reload, przełączenie konta) robi koordynator. Ghostex sam tylko szturcha (nudge) i raportuje, chyba że użytkownik włączył Autopilota.
- Jeden kanał raportu na turę. Wątek, który próbuje pisać do koordynatora w trakcie tury, dostaje odmowę.

---

## 2. Katalog funkcji

### A. Rola, playbook i trzymanie się roli

**A1. Rola przez skill-wskaźnik i `coordinator guide`** - P+K, M
Pierwsza wiadomość koordynatora to zablokowana linia „Read and adhere to this skill: /ghostex-coordinator”. Skill jest tylko wskaźnikiem do `ghostex coordinator guide`, który drukuje playbook wbudowany w serwer (+ format odpowiedzi + nadpisania użytkownika). Powód: gdy playbook był treścią skilla, koordynator trzymał go dwa razy, a Claude Code dołączał skill ponownie po każdej kompakcji; „the playbook's two copies were 9 to 21% of the input cost” (`coord/role.rs`, 11.11). Wcześniej rola szła flagą system promptu; porzucone na rzecz skilla (17.10).
Gdzie: `coord/role.rs`, `coord/playbook.md`, `skills/ghostex-coordinator/SKILL.md`.

**A2. Rola wraca po `/clear` i kompakcji** - K, S
GitHub #570: koordynator Claude po `/clear` przestał startować wątki, bo rola była tylko w pierwszej wiadomości. Teraz hook SessionStart (source clear/compact/startup) dla sesji, którą serwer zna jako koordynatora, wstrzykuje linię skilla i wskaźnik do guide jako kontekst hooka (niewidoczny w czacie). Resume/fork nic nie dodaje. `coord/role.rs` (`coordinator_session_start_context`).

**A3. Notka o zmianie playbooka i `guide --changes`** - K, M
Każda wiadomość docierająca do koordynatora (od użytkownika, raport, kolejka) przechodzi przez jedno miejsce wysyłki, które dokleja raz na wersję guide'a notkę „playbook changed”. Idle koordynatorów się nie budzi. `--changes` drukuje tylko różnicę akapitów; jeśli diff > połowa guide'a, drukuje całość. Powód: pełne przeczytanie to ~7000 tokenów przy każdej zmianie. Rekordy odczytów pod blokadą zapisu (dwa koordynatory jednocześnie gubiły sobie wpisy). `coord/playbook.rs`, `coord/guide_changes.rs`.

**A4. Nadpisania zamiast edycji playbooka** - K, S
Najpierw był pełny edytor playbooka per projekt (19.10). 7.11 użytkownik: „Too complex man... Let us actually make people override parts of the original playbook, not edit it ok? So they have a section for overriding... so this way updates still work”. Jeden tekst nadpisań dla wszystkich koordynatorów, drukowany po playbooku z linią, że ma pierwszeństwo („the playbook is general, the overrides are specific to the actual current user”). Limit 100 tys. znaków, ostrzeżenie od 20 tys. (GitHub #584: realny workflow miał 17 tys.). Koordynator sam proponuje dopisanie reguły i zapisuje po potwierdzeniu (`playbook --add-override`).

**A5. Drift reminders** - K (heurystyka), M
Gdy odpowiedź koordynatora (1) nie ma sekcji z markerami, (2) zadaje pytanie zwykłym tekstem zamiast formularza/item ask, albo (3) koordynator sam edytował pliki projektu lub odpalał build/testy bez `start-thread`, przy następnej dostarczanej wiadomości dostaje jednolinijkowe „Reminder: ...”. Maks. raz na 5 tur. Detekcja celowo konserwatywna: „a false reminder is worse than a missed one”; liczy się pytajnik w ostatnim akapicie poza kodem, edycje poza `docs/`, lista komend buildowych. Po kompakcji dla agentów bez hooków - polecenie ponownego `guide`. `coord/drift.rs` (13.11, Q2980).

**A6. Ostrzeżenie o jakości modelu** - P+K, S
Koordynator na modelu innym niż Opus/Fable/GPT Sol/Astra albo poniżej medium: bursztynowy pill „Coordinator quality may be degraded on <model>” i linia w guide, żeby powiedział o tym raz. Linia nie wchodzi do wersji guide'a (zmiana modelu nie rozsyła notek). `coord/model_quality.rs`. Domyślnie Opus 5.5 high; efforty w pickerze tylko Low/Medium/High/XHigh.

**A7. Promote: zrób z istniejącej sesji koordynatora** - K, S
Bez restartu i przerwania: zapis rekordu, instalacja skilla, wiadomość z linią skilla wysłana od razu (nie do kolejki, decyzja 10.11). Wcześniej uruchomione sesje nie są jego wątkami - adopcja przez `link`. `coord/promote.rs`.

**A8. Tytuły** - K, M
Koordynator zachowuje nazwę nadaną przez użytkownika („no auto renaming for coordinators”, 3.10); linia skilla nigdy nie zostaje tytułem. Wątek dostaje tytuł z `--title` i auto-nazwa agenta go nie nadpisuje (Claude nazwał wątek imieniem koordynatora, bo to była jedyna nazwa w briefie). Potem (24.10): „sub-threads under you should rename themselves to match the latest work they're doing” - brief mówi, a każda wiadomość od koordynatora kończy się przypomnieniem z bieżącym tytułem; wątek robi `rename-self` przed nowym zadaniem. Zmiana nazwy przez użytkownika zawsze wygrywa. Blok nadawcy idzie pod treścią, nie nad nią, żeby agent nie tytułował sesji nazwą nadawcy. `coord/title.rs`, `coord/rename.rs`, `coord/brief.rs`.

### B. Delegowanie

**B1. `start-thread` i brief** - P+K, M
Brief = zadanie od koordynatora + doklejone przez serwer: cel, standing instructions, informacja o worktree, reguła tytułu, reguły raportowania. Reguły (`coord/brief.rs` `thread_brief`): raport końcowy (co, gdzie, jak zweryfikowane, co zostało); nigdy nie pisz do koordynatora sam; kilka zadań w jednej wiadomości = jeden raport na końcu, chyba że poproszono inaczej; decyzję, której nie możesz podjąć, zadaj w raporcie i stop; nie pytaj użytkownika i nie publikuj stron; nie merguj/pushuj/usuwaj bez polecenia; sekret przez `ghostex secret request`; nie kończ tury, żeby czekać na coś, co możesz przeczekać w tle, a jeśli kończysz z jobem w tle - powiedz to w ostatniej linii; raport z markerami sekcji. `start-thread` czeka do minuty na pojawienie się briefu w transkrypcie i zwraca `started` albo `pending: <powód>`; jedna ponowna próba przy błędzie wysyłki. Playbook: „Only `started` means the thread has the work. Do not resend a pending brief”.

**B2. Notatki pamięci nie idą automatycznie do wątków** - P, S
Do 7.11 każda notka szła do każdego wątku (~5500 znaków na 26 notek). Użytkownik: „let the coordinator pick what it sends to the worker threads”. Koordynator sam dobiera i przeformułowuje („do not deploy”, nie „only the coordinator deploys”). Reguły dla wszystkich wątków projektu należą do AGENTS.md.

**B3. Watch dostarczenia i raport „did not reach it”** - K, M
Incydent (4.10): koordynator poszedł dalej po „accepted” z CLI, a follow-up leżał niewysłany w polu wejścia wątku. Teraz każda wiadomość koordynatora do wątku jest pilnowana, aż transkrypt ją zapisze; jeśli wątek przejdzie w idle bez niej, koordynator dostaje raport „undelivered”. Ghostex raportuje, nie wysyła ponownie: „a resent brief makes a thread do the work twice”. Dopasowanie po `sendRequestId`, nie po początku tekstu; wiadomość z samym obrazkiem dopasowywana po czasie (#554); stronicowanie wstecz transkryptu przy długich turach. Wersja zdalna czyta kolejkę na drugim komputerze. `coord/endpoint.rs`, `coord/delivery.rs`, `coord/records.rs`, `coord/remote_undelivered.rs`, `server/src/agent_message_deliveries.rs`.

**B4. Wątek nie może pisać do koordynatora w trakcie tury** - K, S
Incydent 24.10: wątek wysłał „UI patch ready” jako zwykłe dymki bez nadawcy i markerów. Użytkownik: „fix this in the root cause so it doesn't happen again for any user”. Serwer odmawia (`agents send`, `send-text` itp. do własnego koordynatora) z komunikatem „zakończ turę raportem”. Uzasadnienie: raport śródturowy byłby drugim kanałem, którego supervisor nie śledzi, a koordynator działałby (commit, odpowiedź) na turze, która wciąż zmienia pliki. Wątek oznaczony done nie jest objęty. `coord/thread_messages.rs`.

**B5. Wątki read-only** - K, M
GitHub #554: „the reviewer never edits” było tylko tekstem promptu. `--read-only`: Claude w Plan mode, Codex w read-only sandbox, accept-all zdjęte z komendy, tryb trwa przez restarty i wybudzenia. Wyjście z trybu to karta zgody wyłącznie dla użytkownika; Autopilot nigdy jej nie zatwierdza. `coord/read_only.rs`.

**B6. Worktree i zaufanie folderów** - K, S
Wątki dzielące pliki idą jeden po drugim; `--worktree` tylko gdy równoległość naprawdę ma znaczenie (P). Wątek koordynatora ufa folderowi projektu i worktree zrobionym przez Ghostex, więc nie staje na pytaniu „Trust this folder?” (K, `coord/state.rs`); to samo dla worktree na zdalnym komputerze (#502).

**B7. Zmienne środowiskowe roli** - K, S
`GHOSTEX_COORDINATOR_ROLE=thread|coordinator` i `GHOSTEX_COORDINATOR_SESSION` przy każdym starcie terminala, wyliczane z rekordów (nie zapisywane). Issue #463: wrapper uruchamiający wątki z mniejszą liczbą MCP. `coord/launch_env.rs`.

**B8. Wątki na innym komputerze** - K, L
`start-thread --computer <name>`. Komputer koordynatora sam czyta snapshot i czat zdalnego (tamten może mieć starszy serwer i nie wiedzieć o koordynatorze). Osobne wersje stall watcha (zdalny wątek bez hooków „Working” przez 3 h, #475), dostarczenia, reopen, porównywania zegarów (oba czasy z tamtej maszyny). Gdy komputer offline, raporty czekają. `coord/remote_threads.rs`, `coord/remote_stall.rs`, `rt/coordinator_remote_runtime.rs`.

**B9. Adopcja i odłączanie** - P+K, S
`link` adoptuje istniejącą sesję (playbook każe zaproponować adopcję sesji, na której koordynator polega, Q1232), `unlink` robi z wątku zwykłą sesję, `agents create --standalone` daje sesję do rozmowy bezpośredniej, która nikomu nie raportuje.

**B10. Polityka modeli wątków** - P, S
Opus 5.5 high do dużej pracy, Opus medium do trudnej w kilku plikach, Sonnet 5.5 high do małej. Nigdy nie zmieniaj modelu działającego wątku (traci cache promptu); mocniejszy model = nowy wątek.

### C. Supervisor (serce systemu)

**C1. Raporty końca tury** - K, L
Tick co 2 s w `rt/coordinator_runtime.rs`. Typy raportów (`coord/brief.rs` `ThreadReport`): Finished (ostatnia wiadomość, cięta z poleceniem `read-session-chat`), CutOff, Waiting (treść pytania), Closed, Undelivered, Stalled, IdleWaiting. Raport oznaczony jako dostarczony dopiero po udanej wysyłce, więc restart opóźnia, ale nie gubi ani nie dubluje. Przed wysłaniem ponowna weryfikacja: „waiting” wycofany, jeśli użytkownik już odpowiedział w wątku (Q1293); raport o zamkniętym wątku nie budzi zamkniętego koordynatora. Jeden nieudany raport nie blokuje kolejnych; dwa niepowodzenia z rzędu = koordynator nie przyjmuje wiadomości, przerwa. Raport zawiera gotowe komendy leczenia.

**C2. Stall watch: 8 minut bez outputu** - K, L
Issue #427: komenda zawisła, 90 min ciszy, koordynator nic nie wiedział. Output = nowy wiersz transkryptu albo zmiana ekranu, z odfiltrowanym szumem (spinner, timer tury, liczniki tokenów, procenty, koszty, zegary). Po 8 min: nudge do wątku („no new output from you for 8 minutes. Still working? Say what you're waiting on, or carry on.”) i raport do koordynatora, potem co 8 min. Po kolejnej rundzie bez ruchu: czerwona kropka, powiadomienie i dźwięk dla użytkownika. Zwykłe sesje (nie wątki) dostają kropkę po 8 min bez nudge'a. Watch zaczyna od nowa po reload/restart/wake (stary watch czytał porzucony plik transkryptu). Zegar przetrwa restart serwera (start od ostatniego zapisu transkryptu). Pytanie lub karta zgody = cisza z powodu użytkownika, nie zawieszenie (#459). `coord/stall.rs`, `rt/session_stall_runtime.rs`.

**C3. Idle watch: wątek skończył turę, ale „jest winien” pracę** - K (heurystyki), L
Incydent G7h13: „I'll pick up the result when it lands”, joby zabite przez auto-sleep, wątek idle 3 h, nikt nie wiedział. Cztery przyczyny (`coord/idle_wait.rs`): (a) w transkrypcie zakolejkowane, nieodebrane powiadomienia o zadaniach w tle; (b) ostatnia wiadomość mówi, że czeka na job, którego ekran już nie pokazuje; (c) ostatnia wiadomość bez markerów kończy się zapowiedzią („Now opening the fold.”; lista początków zdań: „now”, „next”, „let me”, „I'll”...); (d) najnowsza tura nigdy się nie skończyła. Po 10 min nudge („your background job looks finished: read its result and carry on” albo „carry on where you left off, or say you're finished”) i raport, co 10 min, czerwona kropka po 2 rundach. Wiadomość z markerami to raport: tylko sekcje 🔄/🛫 mogą mówić o czekaniu (fałszywy alarm na G5yb5, 8.11). Postęp rund zapisany na wierszu wątku, żeby restart nie powtarzał nudge'a (#554).

**C4. Nie szturchaj drugi raz** - K, S
13.11: „Never nudge the same session again after it answered a nudge with no new work, until something new happens”. Tura rozpoczęta przez nudge, która się skończyła, oznacza „finished”, nie „quiet”.

**C5. Limit użycia = czekanie, nie zawieszenie** - K, S
17.11: Codex na limicie spał w turze na Retry-After; 206 raportów „still not moving” jednej nocy, nudge kosztował odrzucone żądania. Teraz limit na ekranie = jeden raport, zero nudge'ów, ciąg dalszy po resecie. To samo dla koordynatora na limicie: raporty czekają.

**C6. Odrzucanie przeterminowanych raportów** - K, M
8.11: „a pile of stale 'no new output for 8 minutes' reports for a release thread hours after it finished”. Scheduler kolejki przy dostarczeniu sprawdza, czy raport stall/idle nadal jest prawdziwy; jeśli wątek ruszył, skończył albo został zamknięty - raport cicho wypada (logowane). `coord/stale_report.rs`.

**C7. Wstrzymanie offline** - K, M
Awaria sieci 7.11: jeden wątek dostał 9 nudge'ów i 9 raportów. Offline zegary stoją, nic nie jest wpisywane, po powrocie każdy koordynator słyszy raz. Sprawdzanie dostępności API agenta, nie ping. `server/src/network_status`.

**C8. Rezygnacja z dostarczania po 10 minutach** - K, M
Wcześniej ponowienia co 60 s w nieskończoność i użytkownik nie wiedział, że koordynator nie dostaje raportów. Teraz po 10 min nieudanych prób (online, z min. liczbą prób i odliczaniem snu komputera) jedna czerwona pozycja „Coordinator stopped getting reports”. Nowa wiadomość albo restart wznawia. `rt/coordinator_report_retry.rs`.

**C9. Jeden werdykt „live” dla wszystkich powierzchni** - K, M
Board pokazywał wątki jako „parked”, choć supervisor wiedział, że pracują (hooki gubią tury po restarcie i wybudzeniu). Supervisor publikuje co tick własny werdykt (stan, bieżąca linia, co wątek jest winien) i wszystkie widoki czytają tylko jego. `coord/live.rs`. Ekran (przechwycony) jest mocniejszym dowodem niż hook: powłoka na ekranie = agent martwy, nawet jeśli hook mówi „working”.

**C10. Self-heal zabitych sesji** - K, M
Jednej nocy wszystkie sesje zabite trzy razy, wątki „running” z martwym terminalem. Sesja, której demon zniknął w trakcie pracy agenta (nie sen, nie zamknięcie), jest restartowana na tej samej rozmowie w kilka sekund, maks. 3 razy na 10 min, potem czerwona kropka. Wątek i koordynator dostają „Your session stopped unexpectedly and was restarted...”. `server/src/session_self_heal.rs`.

**C11. Karta „Stopped when Ghostex closed”** - K, M
GitHub #608: po nocnym zamknięciu aplikacji start uruchomił wszystkie wątki naraz (każdy był „due”). Teraz nic nie jest wpisywane; w czacie koordynatora karta z listą przerwanych wątków, Carry on / Not now, checkbox „Compact <thread> first (312K)” per wątek; czerwona kropka do decyzji. Lista tylko wątków, które pracowały w chwili wyłączenia. Opcja „Resume sessions after a restart” omija kartę. `coord/stopped_by_restart.rs`.

**C12. Leczenie to robota koordynatora** - P, S
Playbook: przeczytaj czat (`--last 2`), ekran tylko gdy czat nie wystarcza; zawieszona komenda: interrupt + „carry on” z opisem; skończony job: „Your <job> finished...”; brak reakcji: reload; brak konta: `switch-account`. Użytkownikowi mów tylko, gdy przeniosłeś/przeładowałeś wątek albo leczenie zawiodło. Dwie pułapki: podpowiedź Claude Code w pustym polu to nie wiadomość; „STOP what you are doing” tuż przy raporcie to Escape Ghostexa dostarczający raport - ponów wywołanie.

### D. Zamykanie, wznawianie, sen

**D1. Resolve zamyka sesję, reopen wznawia tę samą rozmowę** - K, M
1.10: „If I close those threads in the sidebar, would we still be able to reopen them...? ... to make the sidebar less cluttered”. `resolve` zamyka sesję skończonego wątku (odmawia, gdy pracuje lub czeka), sidebar trzyma tylko pracę w toku. `--keep-open` tylko oznacza done. 14.11: wątków koordynatora nigdy nie przenosi się do Parked („they should just always appear under the agent that created them”). Playbook: nigdy nie resolvuj wątku ze zmianami, których nie przejąłeś; nigdy `agents close` (zabija turę). `coord/endpoint.rs`, `rt/coordinator_resolve.rs`.

**D2. Wiadomość do zamkniętego wątku go otwiera** - K, M
Reopen przy wysyłce od koordynatora tego wątku albo z „drzwi użytkownika” (desktop, sparowany telefon, plik tokena). Inni nadawcy nie otwierają. Ostatnie „Mark Done” późniejsze niż wysyłka wygrywa (`lastResolvedAt`). Reopen przekazuje raport zatrzymany w czasie, gdy wątek był done (#541). Grace na wybudzanie zamkniętej sesji (#531). `coord/reopen.rs`.

**D3. Zamknięcie koordynatora zamyka jego otwarte wątki** - K, S
Z potwierdzeniem („Close Main Coordinator and its 3 open threads?”); przywrócenie koordynatora przywraca te wątki na tych samych rozmowach. `rt/coordinator_close.rs`, `coord/close.rs`, `coord/restore.rs`.

**D4. Sen** - K, S
Koordynator nie jest usypiany przez Auto Sleep, dopóki któryś wątek pracuje albo czeka na pytanie/zgodę (21.10). „Sleep Inactive Threads” w menu koordynatora usypia tylko jego bezczynne wątki, niczego nie parkuje. Close After Done zabronione na koordynatorze. Auto-sleep i close-after-done działają w serwerze, nie w aplikacji (działają też przy zamkniętym oknie). `coord/auto_sleep.rs`, `coord/sleep_threads.rs`, `server/src/session_auto_sleep.rs`, `server/src/close_after_done.rs`.

**D5. Otwarcie wątku z listy budzi go, ale nie otwiera zadania** - K, S
Kliknięcie zamkniętego wątku wznawia sesję (żeby nie pokazać martwego transkryptu), ale wątek zostaje resolved, więc raporty nie wracają. `rt/coordinator_open_http.rs`.

### E. Pytania, zgody, sekrety

**E1. Pytania tylko w jednym miejscu, z globalnym tagiem Q<n>** - P+K, M
11.10: „i should never have to go into a inner thread to see questions or mockups... I should only talk to u”. Pytanie nigdy zwykłym tekstem ani wbudowanym narzędziem pytań. Cztery formy: `item ask` (wiersz nad polem czatu), link `ghostex-answer:Q41` dla 2-4 krótkich odpowiedzi, formularz ` ```questions ` dla kilku pytań, strona HTML (`ghostex show`) dla rzeczy do obejrzenia. Tagi Q1, Q2... rosną przez całą rozmowę i nigdy się nie powtarzają (12.10, „question numbers restarting at Q1”); `next-tag` po kompakcji; ask z już rozstrzygniętym tagiem jest odrzucany (#579). Linkuj wszystko, o co pytasz (4.11). Pytania wątku koordynator zadaje sam, przenumerowane do swojego licznika.

**E2. Rozstrzyganie pytań z każdej drogi** - K, M
Odpowiedź przychodzi jako „W7 Q12: <odpowiedź>” i jest już zapisana. Działa z karty, z „Reply”, z wpisanego „Q12: yes”, z telefonu, ze zdjęciem. Pill `[title](answering:W7.Q12)` w wiadomości to odpowiedź. Gdy użytkownik wysyła wiadomość, a pytania czekają, koordynator dostaje w bloku `<ghostex-system>` listę „Still open for the user: …” (tylko gdy lista się zmieniła), żeby zamknął te, na które wiadomość odpowiedziała (#627: użytkownik kliknął złą odpowiedź, żeby wyczyścić pytanie). Dismiss = wycofane na zawsze; Snooze 1/6/24 h wraca samo. `server/src/session_chat_open_questions.rs`, `packages/gx-chat-core/src/session/appended_notes.rs`.

**E3. Notatki systemowe jako osobny, ukryty blok** - K, S
Wszystkie doklejki serwera (zmiana playbooka, przypomnienie tytułu, drift, otwarte pytania) idą w jednym bloku `<ghostex-system>` w tym samym submicie, czat je chowa. Jeśli blok otworzył własną turę, agent odpowiada samym „ok”, a ta odpowiedź jest ukrywana. Wcześniej notka powodowała podwójne wyświetlanie wiadomości użytkownika.

**E4. Przekazywanie kart zgód do czatu koordynatora** - K, L
5.11: „bring up those blocks on the sub threads so i answer them here in the coordinator”. Karty Connectors, prompty uprawnień Claude/Codex i folder-trust wątku pokazują się w trzech miejscach: pod raportem „waiting”, w czerwonym pillu Approvals nad polem czatu i na karcie Needs you. Przyciski wątku 1:1 (Always allow z opisem zakresu w tooltipie). Tylko klik użytkownika: CLI odrzuca odpowiedź agenta na kartę `relayedFrom`. Odpowiedź stosowana tylko, jeśli karta jest wciąż ta sama (`relayKey`); w wątku pojawia się „Approved from <coordinator>”. Wynik karty trzymany 2 h, żeby spóźniony raport czytał się jako rozstrzygnięty. Nie działa dla wątków zdalnych. `coord/relay.rs`, `packages/gx-chat-core/src/extras/relayed_approvals.rs`.

**E5. To-do z wątku trafia do Needs you koordynatora** - K, M
`ghostex needs-you add "<co>" [--detail] [--command] [--answer]` w wątku staje się askiem koordynatora (na itemie, do którego wątek jest podpięty, albo nowym), a „Done” wraca też do agenta wątku. Komenda jako chip do skopiowania. `server/src/session_needs_you/`.

**E6. Sekrety przez prywatną kartę** - K, S
`ghostex secret request --label --reason`: użytkownik wpisuje sekret na prywatnej karcie, nigdy w raporcie.

### F. Pamięć i ustawienia koordynatora

**F1. Cel, standing instructions, pamięć** - P+K, S
Cel (jedna linia) i standing instructions doklejane do każdego briefu; należą do użytkownika, koordynator zmienia je tylko na prośbę. Notatki pamięci (`remember`, `forget`) są koordynatora; trwałą preferencję koordynator proponuje dosłownie i zapisuje po potwierdzeniu. Edytory w menu koordynatora (Goal & Instructions…, Memory…). Trzy poziomy: pamięć koordynatora, AGENTS.md projektu, nadpisania playbooka dla wszystkich koordynatorów.

**F2. Linkowanie issue/PR do wątku** - P+K, S
Po `start-thread` koordynator bez proszenia linkuje każdy issue/PR/ticket (`ghostex link add ... --session`). Chipy PR/issue pokazują prawdziwy stan (kolor po odczycie z GitHub). Karta wątku pokazuje linki zamiast pierwszej linii wątku: „no one cares about that... more focused on the branch/pr/issue/linear so i can click on those”.

---

## 3. Work items (board)

Historia: 5.11 board z grupami „kto ma piłkę” (Backlog, To do, Needs you, Blocked, On hold, In progress, Done, Removed, plus Ideas), „keep this board light please”. 6.11 rozdzielenie Blocked (użytkownik musi działać teraz) od On hold (czeka na coś zewnętrznego). 10.11 work items zastępują board (Q2096 „replace”, migracja 0074); stare czasowniki `board` działają jako alias (B7 = W7). Powód: odpowiedzi koordynatora „writing bunch of text at the bottom under Done / Needs you / etc which are jumbling up all the tasks together”.

### Model danych

Tabela `coordinator_work_items` (`server/src/storage/migrations/0074_coordinator_work_items.sql`, `coord/work.rs`), klucz (projekt koordynatora, sesja koordynatora, numer). Pola: `itemNumber` (W<n>, nigdy nie używany ponownie), `title` (nazwa tak, jak nazwałby ją użytkownik), `status` (słowo koordynatora: later, needs, blocked, moving, waiting, finished), `reason` (rodzaj Later: next, held, parked, backlog), `nowLine` (jedna linia „gdzie stoi”, zastępowana, nigdy dopisywana), `link`, `release`, `untested`, `tag` (tag sesji), `forThread` (item istniejący tylko po to, by przypiąć wątek), listy JSON: `threads` (server/project/session), `asks`, `waits`, `steps`, `history`, plus `createdAt/updatedAt/finishedAt/droppedAt`.

Ask: `tag` (Q<n>), `text` (tytuł, ~10 słów, bez nazw kodowych), `detail` (Markdown), `answers` (gwiazdka = rekomendowana), `holds` (blokuje pracę), `steps` (plik/link), `answered`, `settled_at`, `withdrawn`, `snoozed_until`, `command`, `from_thread`. Wait: `on` (W8, Q12, release, ota, rebuild albo słowa), `until`, `since`. Step: `text`, `done`, `chore` (chore nigdy nie jest pokazywany). History: `kind` (add, now, step, ask, answer, reply, wait, done, drop...), `text`, `status`.

Zasada: wątek, krok, rebuild ani pytanie nigdy nie są itemem; podpina się je pod item. Także praca, którą koordynator robi sam (release, merge), jest itemem.

### Statusy i wyliczanie

Statusu, który widzi użytkownik, nie ustawia koordynator wprost: serwer wylicza go ze słowa koordynatora, asków, waitów i stanu wątków (`coord/work.rs` `derive`), w kolejności:

1. dropped / finished (także item przypięty do wątku, który jest done);
2. Blocked: któryś wątek „stuck” po nudge'u (piłka u użytkownika, „<wątek> isn't moving”), albo otwarty ask z `--holds`, albo status blocked;
3. Needs you: wątek czeka na pytanie/zgodę, albo otwarty ask;
4. In progress: któryś wątek pracuje (piłka u wątku);
5. Waiting: na otwarty wait (piłka u: użytkownika dla Q, innego itemu, „outside”); gdy wszystkie waity się zamknęły, piłka wraca do koordynatora;
6. In progress tylko, jeśli koordynator zmienił item w bieżącej lub ostatniej turze; inaczej „Not being worked on” (`coord/turns.rs`, 11.11: „why do i see 18 in progress???”, 4 z 18 faktycznie w toku). Status nigdy nie zapisywany, osobna cicha grupa poza licznikami.
7. Later (next, held, parked, backlog).

Kolejność w panelu: Needs you, Blocked, In progress, Not being worked on, Waiting, Later, Finished (dziś; starsze znikają po 14 dniach).

### Reguły przejść

- `item add` (Later, `--now` = In progress), `item now` (linia + In progress), `item step`, `item ask`, `item wait --on`, `item done "<jedna linia warta zachowania>"`, `item drop` (wycofuje aski, `restore` przez 7 dni), `item edit --status`.
- `item done` nie wycofuje otwartych asków: pytanie lub zadanie dla użytkownika przeżywa item, dopóki użytkownik nie odpowie albo koordynator nie wycofa (10.11). Tylko `drop` wycofuje.
- Done w turze, w której praca jest skończona (wątek zaraportował, zmiana na main, u użytkownika w przebudowanej aplikacji). „Ships in the next release” to notka na linii done, nie status Waiting. Nigdy nie trzymaj In progress „aż użytkownik spojrzy”.
- Waity na zdarzenia czyszczą się same: W8 gdy item skończony, Q12 gdy odpowiedziane, `rebuild` gdy serwer startuje z nowszej binarki, `release`/`ota` gdy flow release'u wywoła `item delivered release v11.7.1`. Item wraca do koordynatora jako „Delivered” do sprawdzenia; Ghostex sam nigdy nie kończy itemu. Wait na słowa nigdy się nie czyści, więc po 2 dniach bez zmian `item list`/`status` każą go sprawdzić (15.11: 22 itemy w Waiting na „the next release”, 15 z nich dostarczonych).
- Needs you bez otwartego pytania ma zawsze przycisk Done („W7: Done” = użytkownik zrobił, przesuń dalej bez dopytywania).
- Przed końcem tury koordynator robi `item list` i sprawdza: nic skończonego w In progress, każde In progress faktycznie w toku, nic w Not being worked on, Delivered/Recheck sprawdzone, każde czekanie na użytkownika ma aska.

### Strażnicy

- user_handoff (K): `item now` z linią przekazującą piłkę użytkownikowi („waiting on your try”, „please test”, itp.) jest odrzucany. 15.11: „Everything that needs me has to be in "Needs You Work Item" status... I want other people to not have this issue also.” Krótka angielska lista fraz, słowa w cudzysłowach i backtickach ignorowane. `coord/user_handoff.rs`.
- drift (K): patrz A5, łapie pytania zadane tekstem.
- Tagi: ask z tagiem już rozstrzygniętym albo użytym przez inny item jest odrzucany z następnym wolnym (#579).
- Przecinek w odpowiedzi: `--answer` powtarzalne albo `\,` (trzy przyciski z dwóch odpowiedzi).

### Dock i Work panel (co widzi użytkownik)

- Dock nad polem czatu: Needs you jako kompaktowa lista (pytanie/zadanie, przyciski odpowiedzi z gwiazdką przy rekomendowanej albo Done, wiek), pod nią Blocked i to, co skończyła ostatnia tura (× usuwa). Maks. 4 wiersze (3 na telefonie), potem „N more need you”; rzeczy starsze niż dzień schodzą niżej. Nagłówek z licznikami (need you, blocked, in progress), przyciskiem Work panelu i statusem bieżącej tury; zwija się do jednej belki i sam się otwiera, gdy coś nowego potrzebuje użytkownika. Snoozed w zwiniętym wierszu na dole.
- Kliknięcie wiersza: pływający panel z tytułem, itemem, pełną treścią, linkami, odpowiedziami, Reply (własne słowa, głos, obrazek; szkic zostaje przy wierszu), Open, menu (Show in chat, Dismiss, Snooze, Copy as Markdown, Mention). Rozstrzygnięcie gdzie indziej zamyka panel z toastem „Answered”/„Withdrawn”. „Nothing you click moves the chat” poza Show in chat.
- Pod odpowiedzią koordynatora karta na każdy zmieniony item („Work item updated”, linia, stan), powyżej 3 jedna karta zbiorcza; wcześniejsza karta tego samego itemu zwija się do jednej linii. Na telefonie jedna linia („Pairing page started · 1 ask”), też w „Worked for 18s · …”.
- Work panel: grupy jak wyżej, przeciąganie między grupami, menu karty (Mention, Tags, Mark done, Drop), widok boczny albo kolumny. Wątek bez itemu ma własny wiersz. Wzmianka `[title](board:B43)` w wiadomości to osobny kolorowy chip z aktualnym tytułem.

---

## 4. Uwaga użytkownika: powiadomienia, kropki, ciche tury, grupowanie

- Koordynator, który kończy turę, gdy którykolwiek jego wątek (lokalny lub zdalny) pracuje, jest cichy: bez niebieskiej kropki, bez powiadomienia. Jedno powiadomienie dopiero przy turze zakończonej bez pracujących wątków. 14.11: „ur spamming me with notifications this is annoying af. only 1 notification when u send me when all done and no running workers”. Wyjątki, które alarmują mimo pracujących wątków: nowy `item ask --holds`, formularz pytań, karta zgody, czerwona kropka. `coord/quiet_turn_end.rs`.
- Wcześniej (13.11): „I don't think anyone cares about when the coordinator finishes... Just show for new needs-you, blocked or approval”. Tekst odpowiedzi nie decyduje (sekcja ❓ była prawie zawsze), decyduje board.
- Skończone tury wątków nie zostawiają nic (ani wiersza w Notifications, ani kropki), dopóki Settings > Notifications > Workers jest Off (domyślnie). Raport i tak idzie do koordynatora.
- Wejście w koordynatora potwierdza (czyści niebieską kropkę) wszystkie skończone, nieobejrzane wątki pod nim, na każdej głębokości; wątek czekający na pytanie/zgodę zachowuje kropkę (24.10). `coord/seen_threads.rs`.
- Kolory kropek: niebieska = skończona tura nieobejrzana, różowa = pytanie (także otwarte to-do), czerwona = zgoda albo „not moving”, szara = proces w tle. Czerwona kropka „not moving” dla wątku pojawia się dopiero po nudge'u i rundzie bez ruchu; leczenie i tak jest koordynatora.
- Sidebar: korona koordynatora (złota dla main), licznik „crew” z jedną liczbą o priorytecie: sesje czekające na zgodę (czerwony), wątki czekające na użytkownika (jasnoniebieski), pracujące (pomarańczowy), wszystkie (szary). Pod koordynatorem tylko wątki pracujące, czekające albo aktywne w ostatnich 2 h; reszta za „N older threads”. Zwinięty koordynator pokazuje nakładające się kropki wątków.
- Workers pill nad polem czatu: liczy pracujące i czekające, menu z pracującymi, „Show recent” (2 h), „N more” z pełną listą (dociągana na żądanie, bo przy ~95 wątkach pełna lista to 30 KB na każdą ramkę). Bursztynowy tag „Needs your approval”. Nagłówek „2 running · 1 needs you · 30 today”.
- Raporty przeterminowane wypadają przy dostarczeniu (C6), offline nic nie idzie (C7), limit użycia = jeden raport (C5), drugi nudge nie idzie (C4).
- Pill „How to use” z wskazówkami (każda z linią do wstawienia w pole czatu), „Don't show again” globalnie.
- Format odpowiedzi koordynatora zależy od ustawienia Marked handovers (Off / Coordinators only (domyślne) / Every session): sekcje z markerami ✅ 🚀 📣 🛫 🔄 ⏸️ 📦 🧪 ⚠️ 🛑 💡 ❓, bez sekcji Needs you dla rzeczy, które są już askiem w docku; przy Off kilka zdań wiadomości. Playbook: „Say only what the dock and the Work panel cannot”, nie wspominaj wątków idle, nie odpowiadaj na raport tylko po to, żeby potwierdzić (to budzi wątek).

---

## 5. Co warto wziąć, a co pominąć

### 10 rzeczy o największej wartości

1. Supervisor push zamiast pollingu (C1). Koordynator kończy turę i budzi go raport z ostatnią wiadomością wątku; raport oznaczony jako dostarczony dopiero po udanej wysyłce i zweryfikowany tuż przed nią. To fundament: tani w tokenach, nie gubi raportów przy restarcie, a cała reszta (stall, idle, delivery) to tylko kolejne typy tego samego raportu.
2. Stall + idle watch z nudge'em i eskalacją (C2, C3, C4, C5). Wątek, który zawisł albo skończył turę „winien” pracę, to najczęstszy realny problem (#427, G7h13, G5yb5). Schemat: Ghostex szturcha sam, koordynator dostaje raport z gotowymi komendami leczenia, użytkownik widzi czerwoną kropkę dopiero po drugiej rundzie. Do tego od razu bezpieczniki: nie szturchaj drugi raz, limit użycia to czekanie, offline wszystko stoi.
3. „Started” vs „pending” i watch dostarczenia (B1, B3). Odpowiedź CLI „accepted” to nie dostarczenie. Sprawdzanie transkryptu adresata i raport „did not reach it” zamiast ponownego wysłania eliminuje cichą utratę pracy i podwójną pracę.
4. Kontrakt raportu wątku (B1, B4). Brief z regułami doklejanymi przez serwer, jeden raport na turę, zakaz pisania do koordynatora w trakcie tury wymuszony kodem, „kilka zadań = jeden raport”, „jeśli kończysz z jobem w tle, powiedz to”. Tanie do zrobienia, a usuwa całą klasę błędów z decyzji 24.10.
5. Work items z wyliczanym statusem (sekcja 3). Koordynator mówi „co i gdzie stoi”, serwer liczy status z faktów (wątek pracuje, ask otwarty, wait spełniony), a „Not being worked on” łapie itemy porzucone w In progress. Odpowiada na problem „18 in progress, 4 naprawdę”. Waity na zdarzenia, które same się czyszczą, i recheck po 2 dniach dla waitów słownych.
6. Jedno miejsce na wszystko, co potrzebuje użytkownika (E1, E2, dock). Każda prośba do użytkownika to ask z krótkim tytułem, szczegółami, odpowiedziami jednym klikiem, Reply, Snooze i Done; nigdy pytanie zwykłym tekstem; globalne tagi Q<n>; rozstrzyganie z każdej drogi, także przez wpisane „Q12: tak”. Strażnik user_handoff wymusza to kodem.
7. Przekazywanie kart zgód do czatu koordynatora (E4). „I should only talk to u”: użytkownik nie musi wchodzić do wątków. Bezpieczne, bo odpowiada tylko klik człowieka, z kontrolą, że karta się nie zmieniła.
8. Ciche tury i jedno powiadomienie (sekcja 4). Bez tego koordynator z kilkoma wątkami spamuje. Reguła „cisza, dopóki pracuje którykolwiek wątek; alarm tylko dla holds, pytań, zgód i czerwonych kropek” plus kaskadowe potwierdzanie kropek wątków przy wejściu w koordynatora.
9. Resolve/reopen na tej samej rozmowie (D1, D2). Sidebar trzyma tylko pracę w toku, a follow-up wraca do wątku z pełnym kontekstem. Do tego: wiadomość od koordynatora lub użytkownika sama otwiera wątek, a późniejsze Mark Done wygrywa.
10. Playbook jako tekst dostarczany przez serwer, z nadpisaniami użytkownika, notką o zmianie, diffem i przywracaniem roli po kompakcji (A1-A5). Rola nie rozjeżdża się po `/clear`, aktualizacje docierają do istniejących koordynatorów bez akcji użytkownika, a użytkownik dopisuje własne reguły bez forka playbooka.

Wartość dodatkowa, mniejsza: stopped-by-restart karta zamiast samoczynnego budzenia wszystkiego (C11), wątki read-only wymuszone trybem agenta (B5), zmienne środowiskowe roli (B7), main coordinator jako adres projektu (rola, nie mechanizm).

### 5 rzeczy, które wyglądają na przerost albo łatki specyficzne dla Ghostex

1. Migracja board → work items i warstwy zgodności. Osiem grup boardu, potem sześć statusów, alias `board` (B7 = W7), rysowanie boardu z work itemów dla telefonów 11.2.1, klucz `moving` wyświetlany jako „In progress”, „Removed” na 7 dni, „Ideas”. To ślad iteracji w ciągu tygodnia; warto wziąć wynik końcowy, nie historię.
2. Heurystyki tekstowe po angielsku. `says_it_carries_on` (początki zdań „now”, „let me”, „I'll”), lista fraz user_handoff, wykrywanie pytań w drift, filtr szumu na ekranie. Kruche i zależne od języka; przy rozmowach po polsku przestaną działać albo dadzą fałszywe alarmy. Lepiej sygnały strukturalne (np. pole w `end_turn`), a nie parsowanie prozy.
3. Obsługa agentów bez hooków i z dziwnym TUI. Empryo (`/agent` profile, czytanie `meta.json`, wpisywanie linii roli w terminal), czytanie ekranu dla Cursor/Freebuff, OpenCode przez plugin TUI, kilkanaście rodzin agentów jako koordynator. Koszt ogromny, wartość tylko przy szerokim wsparciu agentów.
4. Warstwy cache dla ~1100 wątków. Cache wierszy panelu, `thread_reads` z `SETTLE_MS`, ponowne czytanie resolved co 30-40 s, porównywanie generacji. To łata na tick co 2 s czytający JSON z SQLite przy jednym bardzo długo żyjącym koordynatorze (1142 z 1258 wątków u autora). Lepiej od razu zaprojektować model zdarzeniowy niż powtarzać te optymalizacje.
5. Powierzchnia produktowa wokół: Autopilot z agentem-supervisorem i presetami, Chief of Staff z „head role”, GBots z działami, liderami, rutynami i limitami tworzenia, plus drobiazgi UI (przeciągany pływający panel aska, trwałe szkice Reply, kolumny boardu, chipy stylowane decyzjami Q2167/Q2205). Każda rzecz osobno ma sens, ale razem to drugi produkt; dla koordynatora wystarczy rdzeń.

Na granicy: system markerów w raportach (12 emoji, trzy tryby ustawienia, osobny format dla koordynatora) i waity na `release/ota/rebuild` powiązane z flow release'u samego Ghostexa (`item delivered release v11.7.1` w skillu release'u).

---

## Czego nie sprawdziłem

- Szczegółów GBots (rutyny, Day Watcher, pamięć, działy) i agenta-supervisora Autopilota (`rt/autopilot_judge.rs`, notatki) poza komentarzami decyzji i opisem w `features.md`.
- Kodu UI bezpośrednio (`apps/desktop`, `apps/mobile`, `packages/gx-core`); opis UI pochodzi z `skills/ghostex-help/references/features.md` i komentarzy decyzji w `packages/gx-chat-core/src/extras/work_cards.rs` i `appended_notes.rs`.
- Pełnego CHANGELOG (181 wzmianek o koordynatorze) ani testów.
- Porównania z tym, co Threadbear już ma (send_message, end_turn, create_thread, projekty) - to zadanie na kolejny krok.
