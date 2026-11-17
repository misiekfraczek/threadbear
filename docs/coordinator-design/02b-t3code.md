# 02b - T3 Code w głąb: jak orkiestruje wielu agentów

Stan na 17.11.2026. Źródło: klon `github.com/pingdotgg/t3code` (repo potwierdzone), `--depth 1`, commit `3fdd9fc8` z 17.11.2026, w `/tmp/t3code-src`. Ostatnie stabilne wydanie: v0.1.10 (17.11.2026). Nic nie było instalowane ani uruchamiane. Ścieżki `plik:linia` są względne do tego repo.

Oznaczenia: [K] fakt z kodu, [D] deklaracja z dokumentacji repo albo release notes, [W] wypowiedź z sieci, [N] mój wniosek.

Poprawka do `02-inne-ade.md`: zdanie „Koordynatora-agenta nie ma” jest prawdą tylko w tym sensie, że nie ma osobnej roli. Każdy wątek może być koordynatorem: dostaje narzędzia do delegowania, budzi się z wynikami dzieci i odpowiada na ich pytania. Kod sam nazywa rodzica „coordinator” (`packages/client-runtime/src/state/threadShell.ts:164`). [K]

## 0. Najważniejsze w skrócie

1. Nazwa całości to „Orchestrator V2”: przepisany rdzeń, w którym tura, sub-agenci, narzędzia, zgody i checkpointy są jednym grafem wykonania, a wątek-dziecko to zwykły wątek T3 z relacją `subagent` do rodzica (`docs/orchestration-v2/README.md`, „Minimal Mental Model”). [D] Theo, 27.10.2026: „With Orchestrator V2 (harnesses can call each other), we had to fully overhaul this” (fragment z wyników wyszukiwania, x.com/theo/status/2114955695434993702; całego wpisu nie dało się pobrać). [W]
2. Dwa wyraźnie rozdzielone pojęcia: zadanie delegowane (`delegate_task`, dziecko należy do rodzica, wynik wraca sam) i nowy wątek najwyższego poziomu (`t3_thread_launch`, `create_threads`, bez linii, wynik nie wraca). Instrukcje dla agentów i 27 przypadków ewaluacji pilnują, żeby model ich nie mylił. [K]
3. Wynik wraca przez pobudkę, nie przez polling. Każde zakończenie dziecka (completed, failed, cancelled, interrupted) budzi rodzica wiadomością z wynikiem; zakończenia, które przyjdą, zanim pobudka ruszy, doklejają się do tej samej wiadomości. Narzędzia mówią wprost: „Completion wakes this thread. Do not wait on it or poll it.” [K]
4. Pytania i zgody idą różnymi drogami. Pytanie dziecka trafia do agenta-rodzica (wstrzykiwane w jego trwającą turę albo w kolejkę), a on odpowiada narzędziem `t3_pending_request` albo pyta człowieka. Zgody (uprawnienia) zawsze idą do człowieka: flaga wędruje w górę łańcucha do najwyższego wątku widocznego w sidebarze. [K]
5. Dziecko nie zaśmieca listy: wątki delegowane nie mają wiersza w sidebarze, widać je pod rodzicem (panel powiązanych wątków), a ich composer zastępuje pasek „Runs on its own · Open parent”. Człowiek pisze do rodzica, nie do dziecka. [K]
6. Brak ogólnego wykrywania zawieszeń. Jest tylko 15-minutowy limit na turę, w której dostawca zapowiedział ponowienie i nie wrócił (`apps/server/src/orchestration-v2/ProviderSessionManager.ts:90-91`). Otwarte zgłoszenie #37367 (15.11.2026): run wisi w `running` bez końca. [K]
7. Weryfikacja wyniku dziecka nie jest wbudowana. Jest konwencja (każda runda przeglądu to nowe `delegate_task`), obserwacja PR (`watch_pull_request`) i, po stronie zespołu, ewaluacje użycia narzędzi na prawdziwych modelach. [K]

## 1. Model pracy z wieloma agentami

### Co jest [K, chyba że zaznaczono]

- Serwer MCP T3 (`t3-code`) wstrzykiwany do każdej sesji każdego dostawcy z tokenem przypisanym do środowiska, wątku-rodzica, instancji dostawcy i sesji; token wygasa i jest odbierany przy zamknięciu sesji (`docs/orchestration-v2/orchestrator-mcp-server.md:41-56`). [D]
- Narzędzia orkiestracji, pełna lista w `apps/server/src/mcp/toolkits/orchestrator/tools.ts:365-386`: `orchestrator_capabilities`, `delegate_task`, `task_status`, `task_cancel`, `t3_workflow_stop`, `t3_background_wait`, `schedule_task` (+ list/delete), `request_secret`, `create_threads`, `t3_thread_list`, `t3_thread_read`, `t3_thread_update`, `t3_thread_send`, `t3_thread_wait`, `t3_thread_interrupt`, `t3_environment_links` (+ link/unlink). Poza tym plikiem: `t3_thread_launch` (toolkit projektu), `t3_thread_organize` i `t3_pending_request` (`toolkits/thread/tools.ts:33`, `:129`), `watch_pull_request` (`toolkits/pullRequests/tools.ts:327`).
- Delegowanie między dostawcami: rodzic na Claude może dać zadanie Codexowi, Grokowi, OpenCode, Pi itd., z modelem i opcjami (`target.options`, np. effort). Dostawca bez adaptera V2 jest pokazywany jako niedostępny, a nie ukrywany (`orchestrator-mcp-server.md:189-198`). [D]
- Natywni sub-agenci dostawców (Claude `Agent`, Codex `spawn_agent`) zostają. Instrukcje każą ich używać, gdy dziecko ma ten sam dostawca i model, a `delegate_task` tylko dla innego dostawcy, ustawień ponad rodzica, osobnego checkoutu albo na wyraźną prośbę (`packages/provider-core/src/server/orchestrationInstructions.ts:9`). Natywni sub-agenci też są rysowani jako węzły grafu.
- Zagnieżdżenie bez limitu głębokości w kodzie: `task_cancel` zatrzymuje „every task the child delegated”, a Stop rodzica schodzi w dół „depth first” (`docs/orchestration-v2/feature-lifecycles.md:253-259`). Instrukcje hamują to promptem: „As a subagent or child, do the work yourself. Start no subagents unless your task says to” (`orchestrationInstructions.ts:13`).
- Delegowanie na inną maszynę (`target.environmentId`, „linked environments”, eksperyment w Settings → Labs).
- Harmonogramy (`schedule_task`): interwał, godzina albo webhook; przebieg przypięty do wątku albo każdorazowo nowy wątek.
- Forki wątków, side chaty (`/side`, `/btw`) i merge-back: delta „decyzje, zmienione pliki, uruchomione testy, wnioski, otwarte sprawy” wraca do wątku źródłowego z następną wiadomością (`feature-lifecycles.md:209-222`). [D]

### Czego nie ma [K]

- Osobnej roli koordynatora, playbooka koordynatora, „main coordinatora” projektu ani Chiefa (jak w Ghostex, `01-ghostex.md`). Model jest odwrotny: „Ordinary coding tasks need no T3 tools” (`orchestrationInstructions.ts:7`), a każdy wątek deleguje, kiedy trzeba.
- Pola `role` w praktyce: kontrakt przyjmuje `implementation|research|review|design|test|general` (`packages/contracts/src/orchestratorMcp.ts:140-147`), dokumentacja mówi o „optional role instruction” (`orchestrator-mcp-server.md:20-21`), ale w serwerze nie znalazłem żadnego użycia poza schematem. Deklaracja bez pokrycia w tym commicie.
- Automatycznej pobudki dla zwykłych wątków (nie-delegowanych). `t3_thread_wait` czeka z limitem i zwraca `next` tylko, gdy wątek jest zadaniem rodzica (`apps/server/src/mcp/OrchestratorMcpService.ts:3533-3560`). Wątek z `t3_thread_launch` trzeba sprawdzać ręcznie.
- Kontekstu rodzica w dziecku: dziecko dostaje tylko `task` („No parent history”, `tools.ts:91`).
- Ogólnego watchdoga zawieszonych tur i automatycznego „nudge” (patrz 2.5).
- Wiersza dziecka w sidebarze i pisania do dziecka przez człowieka (patrz 2.3).

### Co jest w planach albo w toku

- `docs/orchestration-v2/README.md` opisuje „target architecture”; jako dalszy krok nazywa trwały outbox efektów („Tracked Follow-Up: Durable Effect Outbox”). Plik `apps/server/src/orchestration-v2/EffectOutbox.ts` już istnieje, więc część jest zrobiona; zakresu nie sprawdzałem. [D/K]
- Otwarte zgłoszenia, które pokazują braki: #25764 (27.10.2026) „Delegated children are told never to watch their PR, so nobody follows CI on a child's fix PR”; #26841 (29.10) „A steer cancels the agent's pending question or approval”; #31346 (5.11) dźwięk zakończenia przy każdym dziecku; #37367 (15.11) run wiszący w `running`; #15429 (4.10) brak zużycia tokenów sub-agentów. [K, GitHub]
- Dyskusja #6689 (od 8.03.2026) „Subagent support as nested threads”: użytkownicy chcą dzieci jako niezależnych czatów z cyklem życia (stop, retry, resume pojedynczego dziecka). Julius Marminge, 20.06.2026: „#2829 will have this”. Obecny stan to kompromis: dzieci są wątkami, ale bez wiersza i bez composera. [K, GitHub]
- Publicznej roadmapy w repo nie znalazłem; `AGENTS.md` twierdzi „We share our roadmap”, ale bez wskazania gdzie. [K]

## 2. Mechanika

### 2.1 Jak deleguje

- `delegate_task` (`orchestratorMcp.ts:171-197`): `task`, `target` (dostawca, model, opcje, maszyna), `title`, `role`, `isolation: shared|worktree`, `mode: async|wait`, `timeoutMs` (maks. 45 s, tylko `wait`), `clientRequestId`, `runtimeMode`, `interactionMode`. [K]
- Domyślnie `async`. `wait` „only if this turn needs the result”; pytanie albo zgoda kończą czekanie (`orchestratorMcp.ts:182-187`). [K]
- Idempotencja: `clientRequestId` daje stałe id polecenia, wątku i wiadomości, więc ponowienie zwraca tę samą pracę; bez niego każde wywołanie tworzy nową (`orchestrator-mcp-server.md:545-548`). `t3_thread_launch` nie ma klucza ponowienia, więc po zgubionej odpowiedzi trzeba najpierw sprawdzić listę wątków (`:355`). [D]
- Sufit uprawnień: dziecko i cel `t3_thread_send` nie mogą mieć szerszego trybu niż wywołujący; tryb, którego dostawca nie ma, schodzi do najszerszego dostępnego zamiast startować z pytaniem o każdą komendę (`orchestrator-mcp-server.md:260-265`, `:530-540`). [D]
- `orchestrator_capabilities` raz na wątek, przed pierwszym `delegate_task`; lista modeli celowo krótka, bo „every call lands in the agent's context” (`orchestrator-mcp-server.md:222-228`). [D]
- Typowane odmowy zamiast wyjątków: `capability_denied`, `parent_not_active`, `provider_unavailable`, `runtime_mode_escalation_denied` itd. (`orchestrator-mcp-server.md:550-567`). Instrukcja: „Provider or model unavailable: say so. Never switch unasked or fall back to native tools” (`orchestrationInstructions.ts:10`). [D/K]
- Ciąg dalszy z tym samym dzieckiem: `t3_thread_send` na `childThreadId`; po zakończonym zadaniu to nowe zadanie w tym samym wątku-dziecku, z nowym `taskId`, które też budzi rodzica. Nowa runda przeglądu to zawsze nowe `delegate_task` z briefem, poprzednimi uwagami i zastrzeżeniami (`orchestrator-mcp-server.md:267-274`, `orchestrationInstructions.ts:11`). [D/K]

### 2.2 Jak wraca wynik

- Podsumowanie zadania to ostatnia treść asystenta z ostatniej tury roboczej; przy błędzie najpierw błąd dostawcy (`orchestrator-mcp-server.md:527-528`). [D]
- Pobudka rodzica: `planDelegatedCompletionDelivery` (`apps/server/src/orchestration-v2/Orchestrator.ts:14095`). Każde zadanie ma stan dostarczenia `pending → claimed → acknowledged/delivered/disposed` (`packages/contracts/src/orchestrationV2.ts:657-686`), a run rodzica „kohortę” z jedną zakolejkowaną wiadomością pobudki. Zadanie, które skończy się, gdy pobudka jeszcze czeka w kolejce, dopisuje się do niej zamiast tworzyć drugą (`Orchestrator.ts:14154-14196`). [K]
- Tekst pobudki: „Delegated task <id> (<tytuł>) [status]:” plus wynik, łącznie do 16 000 bajtów; reszta jako „Use task_status with taskId … to read the result” (`Orchestrator.ts:928-950`). Budzą wszystkie stany końcowe, także failed, cancelled i interrupted (`Orchestrator.ts:952-981`). [K]
- Z `mode: "wait"` pobudka jest `settled_only`: wynik odbiera blokujące czekanie, a pobudka przychodzi dopiero po turze rodzica (`OrchestratorMcpService.ts:2785`, komentarz `Orchestrator.ts:14140`). [K]
- Pobudka nie trafia do rodzica zarchiwizowanego albo usuniętego; Stop rodzica „drops wakes its delegated tasks still owe” (`Orchestrator.ts:14117-14135`, `feature-lifecycles.md:253-255`). [K/D]
- `task_status` ma `workState: working | waiting_for_children | result_available`: tura dziecka może się skończyć, a zadanie nie, dopóki jego własne dzieci pracują (`tools.ts:103-105`). Przeczytanie wyniku oznacza go jako dostarczony. [K]
- Restart serwera: finalizacja odtwarza zdarzenia i jest idempotentna; delegacje „continue in their own threads and report back” (`orchestrator-mcp-server.md:505-508`, `RestartContinuation.ts:138`). [D/K]

### 2.3 Jak pokazuje stan człowiekowi

- Sidebar: sekcje Pinned, Active, Working (beta, domyślnie włączona), Snoozed, Settled. Wątek pracujący albo czekający na swoją pracę (sub-agenci, PR z trwającymi checkami, monitory, komendy w tle oznaczone jako oczekiwane) zjeżdża do zwiniętej sekcji Working; wraca na górę, gdy skończy, padnie albo potrzebuje zgody lub odpowiedzi (`docs/user/thread-sidebar.md:134-149`). Serwer wystawia agentom te same pola (`blockedOnThreadWait`, `pendingBackgroundTasks`), „so an agent can see what a thread still waits on” (`orchestrator-mcp-server.md:409-413`). [D]
- Dzieci nie mają wiersza: „Subagents, side chats and tasks delegated from a listed parent have no list row, so an open one is represented by its nearest listed ancestor” (`threadShell.ts:72-74`). [K]
- Panel powiązanych wątków w szczegółach wątku (`apps/web/src/components/chat/ThreadRelationshipsControl.tsx:432`): rodzic, dzieci, forki, transfery kontekstu; stany Starting, Running, Queued, Waiting, Done, Failed, Stopped, Reverted (`ThreadRelationshipIcon.tsx:11-41`); przycisk „Stop subagent” w wierszu (`ThreadRelationshipsControl.tsx:962`); merge-back. [K]
- Wątek-dziecko otwarty: zamiast composera pasek z modelem, effortem, żywym statusem i czasem, „Runs on its own”, „Open parent” (`ProviderSubagentBar.tsx:35-77`). „Subagent threads started by the agent can't take messages; message the parent thread instead” (`thread-sidebar.md:279-281`). [K/D]
- Linki do wątków: wynik każdego narzędzia niesie `link` `t3-thread://v2/<env>/<thread>`; klient pokazuje aktualny tytuł, więc agent nigdy nie przepisuje tytułu, który się zestarzeje po zmianie nazwy (`orchestrator-mcp-server.md:389-401`). Instrukcja i ewaluacje pilnują „mention a thread by its link, verbatim” (`orchestrationInstructions.ts:18`). [D/K]
- Settle: zdjęcie z uwagi bez kasowania, ręcznie albo automatycznie po 7 dniach bezczynności lub po scaleniu PR; praca w toku, otwarte pytania i oczekiwana praca w tle blokują automatyczne settle (`thread-sidebar.md:163-205`). Od v0.1.10 „subagent threads settle with their parent instead of sweeping on their own” (PR #19665). [D]
- Stop na rodzicu zatrzymuje wszystkich delegowanych (`thread-sidebar.md:276`), wstrzymuje kolejkę i obserwacje PR. [D]

### 2.4 Pytania i zgody

- Pytanie dziecka (`user_input`): rodzic dostaje wiadomość „Delegated task <id> is blocked on a question and cannot continue until it is answered” albo „asked a question and is still working” (async u Codexa), z instrukcją: przeczytaj przez `t3_pending_request`, odpowiedz, gdy odpowiedź wynika z zadania lub poleceń użytkownika, inaczej zapytaj użytkownika (`DelegatedTaskQuestionReactor.ts:44-51`). [K]
- Doręczenie: jeśli tura rodzica trwa i dostawca umie sterować bez przerywania narzędzi, wiadomość jest wstrzykiwana w tę turę, bo „a queued notice would wait behind a long-running orchestrator turn that may never end”; inaczej kolejka. Gdy pytanie zostanie odpowiedziane, zanim zakolejkowana tura ruszy, tura jest anulowana (`orchestrator-mcp-server.md:510-525`). [D]
- Zgody nie trafiają do agenta-rodzica („Approvals are not routed, because those tools cannot answer them”). Klient oznacza najwyższego widocznego przodka: „The coordinator answers child questions; approvals and user-only cards need the user” (`threadShell.ts:149-190`, komentarz `:164`). Wynik `delegate_task` niesie `pendingApproval` z zastrzeżeniem „Grants no approval rights” (`orchestratorMcp.ts:244-248`). [K]
- Pytanie może być oznaczone `userOnly`: wtedy nawet jako pytanie idzie do człowieka (`orchestrationV2.ts:2188`, `threadShell.ts:128-134`). [K]
- Sekrety: `request_secret` z kartą jednorazową; zwraca `secretRef` albo plik czytany tylko w komendzie; „No secrets in `task`” przy delegowaniu (`tools.ts:91`, `:209-222`). Threadbear ma to już jako `ask_secret`. [K]

### 2.5 Worktrees

- `isolation: "worktree"`: nowy przygotowany checkout z commita rodzica, „for a separate checkout or PR per child”; niezacommitowane zmiany rodzica nie przechodzą (`orchestratorMcp.ts:176-181`). Zdalne środowisko odrzuca worktree w `delegate_task`. [K]
- `t3_thread_launch` z `workspaceStrategy: root | worktree(baseRef) | existing_worktree(path)`; wątek jest przypięty do workspace'u przed startem agenta, a „Creating a worktree in the task prompt does not update this binding” (`orchestrator-mcp-server.md:342-356`). Instrukcja: „Never make a child's checkout in the shell or in `task`” (`orchestrationInstructions.ts:10`). [D/K]
- Sprzątanie: akcje projektu z `runOnSettle` (np. `cargo clean`) i `stopOnSettle` (`thread-sidebar.md:169-182`). [D]
- Scalanie pracy dziecka nie jest częścią orkiestracji: dziecko robi PR, a obserwować go może tylko rodzic („Subagents cannot watch pull requests; the thread that delegated to them does”, `docs/user/source-control.md:345`), co samo zespół uznał za lukę (#25764). [D/K]

### 2.6 Wykrywanie zawieszeń

- Jedyny watchdog tury: zapowiedziane ponowienie dostawcy bez powrotu przez 15 min zatrzymuje turę i raportuje błąd (`ProviderSessionManager.ts:90-91`, `:2601-2702`). [K]
- Po restarcie przerwana praca w tle dostaje notatkę („RestartBackgroundNote”), ale komenda albo monitor budzi agenta tylko, gdy agent powiedział, że na nią czeka (`awaited: true`), bo „most are dev servers and their watchdogs” (`RestartBackgroundNote.ts:163-166`). [K]
- Limity użycia: stan „Limited”, „Resume at reset”, „Snooze until reset” (`thread-sidebar.md:249-270`, `UsageLimitRecoveryWorker.ts`). [D/K]
- `t3_background_wait`: agent sam oznacza zadania w tle, które trzymają wątek w Working (`tools.ts:146-168`). Uczciwy sygnał „czekam” zamiast zgadywania. [K]
- Nie znalazłem odpowiednika ghostexowego „8 min bez outputu → nudge” ani threadbearowego `stuck-jobs.ts`. [K, przeszukane: stall, stuck, watchdog, inactivity w `apps/server/src`]

### 2.7 Weryfikacja

- Brak wbudowanego sprawdzania wyniku dziecka przez rodzica albo przez osobny model. Konwencja w instrukcjach: przegląd to osobny delegat, „Fix small review findings yourself; start no delegate for them” (`orchestrationInstructions.ts:11`). [K]
- `watch_pull_request`: co 2 min, budzi przy padniętym checku, przejściu wymaganych checków, komentarzu, konflikcie; kończy się po scaleniu, 10 pobudkach z samymi komentarzami albo 8 błędach odczytu; „A wake is not a merge decision. Check readiness yourself” (`source-control.md:334-354`, `toolkits/pullRequests/tools.ts:329`). [D/K]
- Ewaluacje zachowania agentów (`evals/mcp-tool-use/`): 47 przypadków orkiestracji i 27 „threads vs tasks”, każdy z opisem złego doświadczenia, regułą i źródłem (issue, prośba maintainera z datą). Przykłady: `polling-after-async-delegates`, `too-many-delegates-cancel-extras` („we have like 6+ delegates going”), `stop-all-delegates-uses-task-cancel`, `tt-separate-thread-i-can-follow`. Zasady: przypadek przed poprawką, przypadki kontrolne, kilka próbek, porównanie z baseline (`evals/README.md`). [K]
- Test na żywo pobudek z prawdziwymi CLI: `docs/operations/background-verification.md` (dostarczenie po końcu tury rodzica, w trakcie aktywnej komendy, zagnieżdżone wyniki, przetrwanie restartu). [D]

## 3. Co warto przenieść do Threadbear

Stan Threadbear według `03-threadbear.md` (17.11.2026).

1. Pobudka per zakończenie, na każdy stan końcowy, z paczkowaniem. T3: każde dziecko budzi rodzica przy completed/failed/cancelled/interrupted, a kolejne doklejają się do czekającej pobudki. Threadbear: `waitFor` budzi tylko po wszystkich (maks. 5) i tylko przy czystym `needs: "nothing"` (L1, L2 w `03-threadbear.md`). [N] To najmocniejszy argument dla PR-a do Mike'a: tryb „any” z paczkowaniem i budzenie na błąd/zatrzymanie, z tekstem pobudki zawierającym status i wynik z limitem bajtów.
2. Pytania dziecka do koordynatora, zgody do człowieka. T3 rozdziela to w kodzie (`threadShell.ts:164`). Threadbear dziś: dziecko z `needs: "you"` nie budzi `waitFor`, a pytania lądują w Decisions projektu (`projectDecisions`). [N] Minimum bez forka: playbook mówi koordynatorowi, żeby po pobudce sprawdził `asks` dzieci i odpowiedział przez `send_message`, gdy odpowiedź wynika z briefu. Docelowo runner: dziecko kończące z `needs: "you"` budzi startera wiadomością „blocked on a question”.
3. „Następny krok” w wyniku narzędzia. T3 dokleja `next: "Completion wakes this thread. Do not wait on it or poll it…"` do każdego wyniku dotyczącego biegnącego zadania (`orchestratorMcp.ts:203-204`). [N] Tanie i skuteczne: wynik `create_thread` w Threadbear mógłby mówić to samo o `end_turn({ waitFor })`. Zmienia budżet kontekstu tylko o jedno zdanie w wyniku, nie w opisie narzędzia.
4. Rozdział „zadanie” vs „wątek dla człowieka”. T3 ma osobne narzędzia i ewaluacje. Threadbear ma jedno `create_thread` z `nested`. [N] Bez nowych narzędzi: w playbooku koordynatora jasna reguła, kiedy `nested: false` (Michał chce z wątkiem rozmawiać sam) i że tylko zagnieżdżone dzieci są „winne” raport.
5. Stop schodzi w dół. Stop rodzica i `task_cancel` zatrzymują całe poddrzewo, kolejki i obserwacje PR (`feature-lifecycles.md:253-259`). [N] Nie sprawdzałem, czy `interrupt_thread` w Threadbear działa rekurencyjnie; jeśli nie, to mała zmiana w runnerze warta zgłoszenia.
6. Dzieci znikają razem z rodzicem. T3: dzieci settle'ują się z rodzicem (v0.1.10). Threadbear: `quietInbox` archiwizuje pomocnika, którego Michał nie dotknął; brak reguły „zarchiwizuj dzieci razem z koordynatorem”. [N] Do playbooka albo do `quietInbox`.
7. Link do wątku zamiast tytułu. T3 każe agentom wklejać `link` dosłownie, a klient renderuje aktualny tytuł. Threadbear upstream dodał 17.11 linki `thread:<id>` w asks (`03-threadbear.md`, sekcja 4). [N] Reguła do playbooka: w raporcie dla Michała każdy wątek jako link, nie tytuł ani id.
8. Ewaluacje playbooka. T3 trzyma przypadki złych zachowań orkiestratora jako dane z datą i źródłem, z regułą „przypadek przed poprawką”. [N] Dla skilla `koordynator` wystarczy plik przypadków (np. „pollował dziecko”, „nie odpowiedział na pytanie dziecka”, „uruchomił 6 delegatów”) i ręczny przebieg na tanim modelu przed zmianą playbooka. Pasuje do zasady Mike'a o testach z najtańszym modelem.
9. Uczciwe „czekam na to”. `t3_background_wait` i `awaited: true` rozróżniają pracę, na którą agent czeka, od dev servera zostawionego w tle (`tools.ts:146-168`). [N] Threadbear `stuck-jobs.ts` i liczenie „pracuje” w `nestedThreads` mogłyby korzystać z tego samego rozróżnienia; dziś każde zadanie w tle jest pracą.
10. Sufit uprawnień przez odmowę, nie kartę. T3 odrzuca eskalację typowaną odmową. Threadbear pokazuje kartę zgody przy wyższym trybie (`threadbear-mcp.ts:1872-1878`). [N] Threadbear jest tu łagodniejszy i to ma sens przy jednym użytkowniku; nie zmieniać, tylko zanotować różnicę.

## 4. Czego nie kopiować

- Przepisania rdzenia na graf wykonania i kohorty dostarczeń. `Orchestrator.ts` ma 16 482 linie, a release notes v0.1.9 i v0.1.10 to w dużej części poprawki wyścigów w pobudkach (np. „a steer during a delegate_task wait no longer drops the child's result”, „removing a queued completion message keeps its siblings' wakes”). [K/N] Threadbear potrzebuje efektu (pobudka per zakończenie), nie maszynerii.
- Dwudziestu kilku narzędzi i podwójnej rejestracji serwera pod Codex Code Mode. Threadbear ma budżet kontekstu narzędzi (`runner/context-budget.json`), a Mike chce go chudego. [N]
- Blokującego `mode: "wait"` z limitem 45 s. Sam T3 każe go używać rzadko, a pobudka `settled_only` komplikuje dostarczanie. Hibernacja `waitFor` w Threadbear jest prostsza. [N]
- Odcięcia człowieka od dziecka (brak composera). W Threadbear dzieci to pełne wątki, które Michał otwiera i do których pisze; użytkownicy T3 sami o to proszą w dyskusji #6689. [N]
- Delegowania między dostawcami jako rdzenia koordynatora. Threadbear ma już `pool`/`account`/`model` w `create_thread` i `subscriptionFallback`; reszta to specyfika T3. [N]
- Ukrywania dzieci z listy bez zastępstwa. T3 to robi, bo ma panel powiązań i flagi w górę łańcucha; Threadbear bez `nestedThreads` (Mike wyłączył u siebie 16.11) nie ma gdzie ich pokazać. [N]

## 5. Źródła z sieci (z datą)

- Theo, x.com/theo/status/2114955695434993702, 27.10.2026 (fragment z wyszukiwarki, pełny wpis niedostępny dla scrapera).
- Theo, x.com/theo/status/2027497136519311743, 27.02.2026, tytuł wyniku: „Make an agent orchestration layer that my team enjoys using” (wizja; treści nie pobrałem).
- Ben Davis, x.com/davis7/status/2121329129639596263, 13.11.2026: „Orchestrator v2 in T3 code is one of if not the most useful things right now… the models get when u can mix” (fragment).
- Wideo „T3 Code Orchestrator V2: Multi-Agent Workflows”, kanał Alexito's World (nie zespół T3), 10.10.2026, youtube.com/watch?v=gM5z0VV6cpo: porównanie natywnych sub-agentów z delegowaniem między harnessami (tylko opis i streszczenie).
- skyflo.ai/compare/t3-code (bez daty): twierdzi, że orchestrator V2 jest stabilny od v0.1.0. Niezweryfikowane.
- GitHub: dyskusja #6689 (8.03-18.08.2026), zgłoszenia #25764, #26841, #31346, #37367, #15429; release notes v0.1.9 (11.11.2026) i v0.1.10 (17.11.2026), `gh release view`.

## 6. Luki tego przeglądu

- Klon płytki: brak historii commitów, więc nie wiem, kiedy weszły poszczególne mechanizmy (poza datami release notes i zgłoszeń).
- Nie uruchamiałem T3 Code; opis UI pochodzi z kodu web i dokumentacji, bez zrzutów. Aplikacji mobilnej nie czytałem.
- Nie przeczytałem całego `Orchestrator.ts` ani `OrchestratorMcpService.ts`; odwołania dotyczą wskazanych funkcji.
- Pole `role`: nie znalazłem użycia w serwerze, ale mogłem przeoczyć użycie w kliencie (np. etykieta).
- Wypowiedzi Theo znam tylko z fragmentów wyszukiwarki; X blokuje scraper. Filmów zespołu T3 nie oglądałem.
- Nie sprawdzałem w kodzie Threadbear rekurencji `interrupt_thread` ani idempotencji `create_thread` (punkty 3.5 i 2.1 porównania).
