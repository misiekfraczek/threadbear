# Koordynator w innych ADE i narzędziach do agentów (stan na 17.11.2026)

Cel: zobaczyć, jak inne środowiska rozwiązują „koordynatora” - agenta albo warstwę, która dzieli pracę na wiele sesji, śledzi je i raportuje człowiekowi - i wybrać, co warto skopiować do Threadbear. Ghostex analizuje osobny wątek, tu go pomijam.

Oznaczenia przy twierdzeniach:

- [D] - fakt z dokumentacji, bloga lub changelogu producenta,
- [U] - opinia albo doświadczenie użytkowników (HN, Reddit, recenzje),
- [W] - mój wniosek.

Źródła są przy każdej sekcji, z datą publikacji albo datą odczytu (17.11.2026), gdy strona jej nie podaje.

## Najważniejsze w pięciu zdaniach

1. W 2026 r. trzej duzi gracze dowieźli niemal ten sam produkt: jedna długa rozmowa z koordynatorem, który sam nie pisze kodu, uruchamia wątki-wykonawców i pokazuje, które czekają na człowieka (Claude Code Projects, Cursor Projects, Devin z managed Devins). [D]
2. Lepsze z nich grupują wątki według tego, czego potrzebuje człowiek („Czeka na ciebie”, „Do przeglądu”, „Pracuje”, „Ląduje”, „Bezczynny”, „Zamknięty”), a nie według stanu procesu. [D]
3. Najlepsze systemy weryfikacji oddzielają wykonawcę od sprawdzającego i ustalają kryteria sukcesu przed implementacją (Factory Missions, Jules Planning Critic, Foremerge). [D]
4. Użytkownicy wciąż mówią to samo: wąskim gardłem jest uwaga i przegląd człowieka, a nie liczba agentów; realny limit to 2-5 aktywnych wątków. [U]
5. Koordynator, który przekazuje wszystko przez siebie, zjada 40-50% tokenów; taki, który tylko przydziela zadania i jest budzony zdarzeniami, schodzi do około 10%. [U]

## Tabela porównawcza

Tabela A - kto koordynuje, jak deleguje, jak wraca wynik i co widzi człowiek.

| Narzędzie | Koordynator | Delegacja i izolacja | Wyniki | Stan dla człowieka |
| --- | --- | --- | --- | --- |
| Claude Code: subagenci | Główna sesja | Brief w wywołaniu, własny kontekst, opcjonalnie worktree | Push: podsumowanie do rozmówcy | `/tasks`, @-wzmianki ze statusem |
| Claude Code: agent teams (eksperyment) | Lead (sesja) | Spawn prompt + CLAUDE.md, bez worktree, wspólna lista zadań z blokadą plikową | Push: powiadomienie o bezczynności z odpowiedzią | Panel agentów pod promptem, split panes (tmux/iTerm2) |
| Claude Code: agent view | Człowiek | Każda sesja w tle, przed edycją przenosi się do własnego worktree | Push: powiadomienia (needs input, done, failed) | Lista wg stanu, wiersz z podsumowaniem od Haiku |
| Claude Code: Projects (beta) | Rozmowa projektu (Opus, niski effort) | Wątek = sesja w chmurze na własnej gałęzi albo lokalnie przez Remote Control | Push: wątek raportuje do rozmowy | Overview: Ready for review, Waiting on you, Working, Landing, Idle, Resolved |
| Codex (CLI, app, IDE) | Główny wątek | Brief w spawnie, dziedziczy sandbox i zgody | Czeka na wszystkie, jedna zbiorcza odpowiedź | `/subagents`, panel nad composerem (Active/Done) |
| Cursor Projects | Koordynator w chmurze, nie pisze kodu | Cloud Agents na VM, lokalny agent gdy trzeba | Push do rozmowy; subskrypcje (Slack, PR, CI) | Wspólna tablica zadań z PR przy zadaniu |
| Conductor | Człowiek | Workspace = worktree + gałąź + terminal | Poll (człowiek patrzy) | Pasek workspace'ów, diff, review |
| Vibe Kanban | Człowiek | Karta = workspace w worktree | Poll | Kanban (To do, In progress, Review, Done) |
| Claude Squad | Człowiek | Sesja tmux + worktree na agenta | Poll | Lista w TUI |
| Sculptor (Imbue) | Człowiek | Worktree (dawniej kontener Docker) | Poll | Jedno okno z wszystkimi agentami |
| Superset | Człowiek (+ CLI i MCP dla agentów) | Worktree, setup script, zdalne workspace'y | Push (powiadomienia) | IDE: zadania, diff, PR |
| Orca | Agent-koordynator przez CLI `orca orchestration` | Run, Task, Dispatch; worker w bieżącym albo nowym worktree | Push: skrzynka koordynatora (`worker_done`, `question`, `heartbeat`) | Klikalne ID zadań, terminale workerów |
| T3 Code | Człowiek (sub-agenci natywnych CLI widoczni) | Wątek w checkoutcie albo worktree | Push (zgody i statusy w UI) | Pasek wątków: active, waiting, finished, settled |
| Amp | Główny wątek | Task subagent z instrukcją od głównego agenta, bez komunikacji między nimi | Push: końcowe podsumowanie | Krok subagenta w wątku |
| Factory Missions | Orchestrator (planuje, nie implementuje) | Feature = świeży worker; runner programowy | Walidatorzy na końcu kamienia milowego | Kamienie milowe, kontrakt walidacji |
| Devin | Główna sesja Devina | Managed Devin = osobna VM; dynamic workflows jako skrypt Python | Push + koordynator czyta trajektorie dzieci | Link do każdej sesji; panel workflow z fazami |
| Jules | Brak koordynatora (zadania niezależne) | Zadanie = VM, do 60 równolegle na najwyższym planie | Poll / PR | Lista zadań, plan do zatwierdzenia |
| Warp Oz | Agent-rodzic w trybie `orchestrate` | Dzieci lokalnie albo w chmurze, w środowiskach | API: stan, artefakty, transkrypt | Pasek „pigułek” z dziećmi i statusem |
| OpenHands | SDK (Task Tool Set), badawczo CAID | Worktree na inżyniera, manager scala | JSON + commity | Brak widoku wielu agentów (zgłoszenie #18057) |
| cmux | Człowiek | Workspace na zadanie, dowolne CLI | Push: „pierścień” powiadomienia na panelu | Pionowe karty z gałęzią, portami, ostatnią linią wyjścia |
| Zed | Człowiek | Wątek, opcjonalnie worktree | Poll | Threads Sidebar grupowany po projekcie |
| Kiro (IDE, Crew) | Główna sesja; w specach automatyczne fale | Fale zadań bez wspólnych plików; subagenci z izolowanym kontekstem | Push: wynik wstrzyknięty do rozmowy | Panel Activity (running, done, failed, stalled) |
| GitHub Agent HQ | Człowiek | Zadanie = agent w chmurze GitHuba | Poll / PR | Mission control: logi sesji, sterowanie, PR |
| Gas Town | Mayor (agent) | Convoy zadań z Beads do rigów, polecaty w worktree | Skrzynki (Erlang-style), handoffy | Konwoje, role, panel webowy |
| Paperclip | „CEO” agent w schemacie organizacyjnym | Tickety, heartbeaty, budżety | Heartbeat co N godzin albo przydział ticketu | Tickety ze śladem, koszty na agenta |

Tabela B - pytania, weryfikacja, zawieszenia, pamięć i koszty.

| Narzędzie | Pytania i zgody | Weryfikacja | Zawieszenia | Pamięć i reguły | Koszty i modele |
| --- | --- | --- | --- | --- | --- |
| Claude Code: agent teams | Prompty zgód teammate'ów trafiają do sesji leada | Hooki `TaskCompleted`, `TeammateIdle` (exit 2 = wróć do pracy) | Powiadomienie o błędzie API; brak heartbeatu | CLAUDE.md, definicje subagentów jako role | Model per teammate; 3-5 teammate'ów zalecane |
| Claude Code: Projects | Zgoda tylko w samym wątku; „idź dalej” w rozmowie projektu jej nie daje | Wątek pilnuje PR z auto-fix CI, odpisuje, gdy gotowy | Wątek „Waiting on you” także przy błędzie | Instrukcje projektu + pamięć projektu | Osobno model i effort koordynatora i wątków |
| Codex | Nakładka zgody z etykietą wątku źródłowego, `o` otwiera wątek | Brak wbudowanej; wzorzec „wielu recenzentów” w promptach | Brak | AGENTS.md, pliki agentów TOML | `max_concurrent_threads_per_session`, model per agent |
| Cursor Projects | Wiadomość od agenta kolegi to „niezaufane wejście”, idzie do bocznego czatu | Artefakty (zrzuty, wideo) przy przeglądzie | Brak danych | Wspólny Context store, osobny magazyn osobisty | Każdy agent rozlicza się osobno |
| Orca | `orca orchestration ask` z opcjami i timeoutem; bramki decyzyjne blokujące zadanie | `worker_done` z `--outcome` i listą zmienionych plików | Heartbeat co 5 min (1-60), ponowienie z `--retry-of` | Preambuła kontraktu wstrzykiwana workerowi | Model i effort per worker |
| Factory Missions | Orchestrator zatrzymuje misję i oddaje sterowanie przy blokadzie | Kontrakt walidacji przed featurami; niezależni walidatorzy | Brak danych | Wspólne pliki stanu, baza wiedzy misji | Osobne modele dla orchestratora, workerów i walidatorów |
| Devin | Wiadomości do dzieci w trakcie | Każde dziecko testuje swoje zmiany przed raportem | Usypianie i zabijanie dzieci, wiadomości do siebie na później | Wiedza i playbooki Devina | ACU na dziecko; Devin Lite do szerokiego fan-outu |
| Jules | Plan do zatwierdzenia, auto-akcept po czasie | Planning Critic przegląda auto-zatwierdzone plany | Brak danych | Setup script repo | Limity zadań dziennie i równolegle |
| Kiro Crew | Zgody dziedziczone z sesji | Brak wbudowanej | Wiersz „stalled”, cisza nie oznacza końca | Wstrzykiwana pamięć (preferencje, lekcje) | Limit z pamięci i CPU hosta, odmowa spawnu jako back-pressure |
| Gas Town | Przez Mayora | Refinery: presety review + CLAUDE.md | Witness ubija i zastępuje leniwych polecatów, Deacon sprząta zombie | Beads (tracker), handoff przy ~60% kontekstu | Wiele planów Max |
| Paperclip | Zarząd (człowiek) zatwierdza zatrudnienia i strategię | Brak | Heartbeat wymusza „obudź się i sprawdź” | SKILL.md, cele od misji do taska | Budżet miesięczny na agenta, ostrzeżenie przy 80%, pauza przy 100% |
| Foremerge | Agent publikuje intencję i zakres przed edycją | Check akceptacyjny uruchamiany przez system; deklaracja agenta „testy przechodzą” nie wystarcza | - | SQLite w katalogu git | - |

## Narzędzia po kolei

### Claude Code (Anthropic)

Claude Code ma dziś pięć sposobów pracy równoległej: subagentów, agent view, agent teams, Projects i dynamic workflows, plus worktrees, cross-session messaging i `/batch` jako narzędzia pomocnicze. [D]

- Subagenci: własny kontekst, wynik wraca jako podsumowanie. Nazwani subagenci mogą pisać do siebie. [D]
- Agent teams (eksperyment, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): lead, teammate'ci, wspólna lista zadań (pending, in progress, completed, zależności blokują) i skrzynki w plikach JSON. Zadania można przydzielić albo teammate sam bierze następne odblokowane; claim chroni blokada plikowa. Gdy teammate kończy, lead dostaje automatyczne powiadomienie z jego końcową odpowiedzią; lead nie musi pytać. Prompty zgód teammate'ów pojawiają się w sesji leada. Teammate nie może przekazać zgody za człowieka, a w trybie auto klasyfikator traktuje „zgodę” przekazaną przez innego agenta jako niezaufane wejście. Agent teams nie dają teammate'om worktree - pracę trzeba dzielić po plikach. Dokumentacja radzi zaczynać od 3-5 teammate'ów i mówi wprost, że koszt tokenów rośnie liniowo. Hooki `TeammateIdle`, `TaskCreated`, `TaskCompleted` z kodem wyjścia 2 pozwalają odrzucić zakończenie i odesłać feedback. W trybie `-p` i w Agent SDK teammate'ów nie ma. [D]
- Agent view (`claude agents`, research preview): jedna lista sesji w tle grupowana według stanu, przypięte i czekające na górze. Stany: Working, Needs input (żółty: pytanie, zgoda, prompt sandboksa), Ready for review, Completed. Jednolinijkowe podsumowanie wiersza pisze model klasy Haiku: w trakcie pracy wiersz odświeża się najwyżej co 15 s z własnego wyjścia sesji bez zapytania do modelu, nowe podsumowanie powstaje na końcu tury, a w długiej turze co kilka minut. Wiersz zablokowany pokazuje zadawane pytanie. Powiadomienia przy needs input, finished, failed; nadzorca restartuje proces sesji, która przestała odpowiadać. Sesja wysłana z agent view przenosi się do własnego worktree, zanim zacznie edytować. [D]
- Projects (public beta, Pro/Max/Ultra): „jedna długa rozmowa, w której Claude koordynuje strumień powiązanej pracy”. Koordynator decyduje, co staje się wątkiem, a co dostaje odpowiedź na miejscu, i kieruje kolejne wiadomości do wątku, który już pracuje w danym obszarze. Widzi to, co wątki raportują, a nie każdy ich krok. Wątek w chmurze pracuje na własnej gałęzi, otwiera PR, pilnuje go z auto-fix CI i odpisuje, gdy PR jest gotowy. Overview grupuje wątki: Ready for review, Waiting on you (także nieudane), Working, Landing, Idle, Resolved (zamknięte przez człowieka, przez Claude po ostatnim kroku, np. scaleniu PR, albo automatycznie po tygodniu bez ruchu). Zgoda na narzędzie działa tylko w samym wątku; „idź dalej” napisane w rozmowie projektu do niego nie dociera. Preferencje typu „najwyżej dwa wątki naraz” Claude zapisuje w pamięci projektu, ale dokumentacja zaznacza, że to nie jest twardy limit. Domyślnie wszystko na Opusie: wątki high effort, koordynator low effort. Koordynator pracuje na ostatnich wiadomościach, ostatnich wątkach i pamięci projektu, nie na całej historii. [D]
- Cross-session messaging: sesje (lokalne, na innej maszynie, w chmurze) mogą do siebie pisać przez `ListAgents` i `SendMessage`. Wiadomość czytana jest między wywołaniami narzędzi; bezczynna sesja dostaje nową turę. Jest limit rozmiaru i limit serii. [D]

Źródła: code.claude.com/docs/en/agent-teams (14.11.2026), /agents (12.11.2026), /agent-view i /cross-session-messaging (odczyt 17.11.2026), /claude-projects (13.11.2026).

[W] Projects to najbliższy odpowiednik tego, co chcemy w Threadbear, z jedną różnicą: Threadbear trzyma wątki na Macu Michała i na jego loginach, a Projects w chmurze Anthropic.

### OpenAI Codex

Subagenci są domyślnie włączeni w CLI, aplikacji i IDE. Główny wątek czeka, aż wszyscy zlecani agenci skończą, i daje jedną zbiorczą odpowiedź. `/subagents` przełącza między wątkami. W CLI prośba o zgodę z nieaktywnego wątku pojawia się w nakładce z etykietą wątku źródłowego, a `o` otwiera ten wątek przed decyzją. Subagenci dziedziczą sandbox i tryb zgód rodzica; plik agenta nie może ich zmienić. Wbudowane role: `default`, `worker`, `explorer`; własne w `.codex/agents/*.toml`. Limit `agents.max_concurrent_threads_per_session`. Dokumentacja zaleca równoległość głównie do czytania (eksploracja, testy, triage) i ostrożność przy równoległym pisaniu. W ChatGPT Work na poziomie Ultra model sam deleguje bez prośby. [D]

Agents API (beta od 10.09.2026) wystawia harness Codexa z `multi_agent: { enabled, max_concurrent_subagents }`. [D]

W multi-agent v2 treść zleceń między agentami jest szyfrowana i operator nie może odczytać, co rodzic kazał dziecku; zgłoszenie zamknięto jako „not planned”. [D: github.com/openai/codex/issues/32753, 13.07.2026]

Źródła: developers.openai.com/codex/subagents (odczyt 17.11.2026), openai.com/index/introducing-the-agents-api (10.09.2026).

### Cursor

- Agents Window (Cursor 3, kwiecień 2026): jedno okno do wielu agentów lokalnie i w chmurze, przenoszenie zadania między lokalnym a chmurą jednym kliknięciem, `/multitask` i „Build in Parallel” z planu (niezależne kroki naraz, zależne po kolei). [D: cursor.com/help/ai-features/multi-agent]
- Projects (10.09.2026): rozmawiasz z koordynatorem, który „nie pisze kodu, tylko kieruje agentami, którzy piszą”, więc „nigdy nie jest zablokowany i zawsze odpowiada”. Chmura domyślnie, lokalny agent, gdy coś trzeba sprawdzić na maszynie. Wspólny kontekst w plikach synchronizowanych między maszynami: agenci dopisują badania, artefakty i to, czego się nauczyli o repo. Subskrypcje: koordynator słucha kanału Slack, PR, CI albo harmonogramu i działa bez promptu; pigułka „Listening” pokazuje, czego słucha. Cursor podaje, że użytkownicy głównie na Projects scalają sześć razy więcej PR. [D: cursor.com/blog/projects, cursor.com/docs/agent/projects]
- Projects multiplayer (10.11.2026): wspólna tablica zadań z PR przy zadaniu. Koordynatory różnych osób piszą do siebie; wiadomość ląduje w bocznym czacie, który tylko odpowiada, nie może zmieniać tablicy ani pytać człowieka, a treść jest oznaczona jako niezaufane wejście od agenta. [D: cursor.com/blog/projects-multiplayer]
- Na forum: koordynator dziedziczy model na workerów, brak osobnego domyślnego modelu dla workerów; każdy agent rozlicza się osobno, „na dużym repo to się sumuje”. [U: forum.cursor.com, 14 i 22.09.2026]

### Conductor (Melty Labs)

Aplikacja na Maca do równoległych agentów Claude Code, Codex, Cursor i OpenCode. Workspace to osobna gałąź, worktree, terminal, diff i ścieżka review. Dokumentacja daje prostą regułę: osobne workspace'y dla pracy, która ma lądować niezależnie, jeden workspace dla wielu agentów, gdy dzielą gałąź (implementacja + review + naprawa testów). Koordynatora-agenta nie ma; koordynuje człowiek. 0.90.0 z aplikacją na iOS 2.10.2026. [D: conductor.build/docs/concepts/parallel-agents, odczyt 17.11.2026; dev.to 5.11.2026]

### Vibe Kanban (Bloop)

Kanban dla agentów: karta to workspace z gałęzią, terminalem i serwerem dev w worktree; inline komentarze do diffu wracają do agenta, PR z opisem od AI. Bloop zamknął firmę 10.04.2026, chmura (wspólne tablice, komentarze, organizacje) zgasła po 30 dniach, kod żyje jako Apache-2.0 utrzymywany przez społeczność. [D/U: vibecoding.app/blog/vibe-kanban-review, 2.08.2026]

### Claude Squad

TUI w Go: sesja tmux i worktree na agenta, dowolne CLI. Brak widoku zbiorczego, brak telefonu. Utrzymywany. [U: agentsroom.dev, 23.06.2026]

### Crystal

Wycofany w lutym 2026, następca to płatny Nimbalyst. [U: agentsroom.dev, 23.06.2026] Pomijam.

### Sculptor (Imbue)

Open source (MIT), worktree z gałęzią, terminalem i diffem na workspace, wtyczki w JS/TS, harness Pi jako opcja, skille do spec, mocków i TDD, „CI Babysitter” sam wysyła agentów do naprawy padającego CI. Agenci pushują do lokalnego remote, a człowiek robi `git fetch` u siebie. Wcześniej Sculptor stawiał na kontenery Docker i Pairing Mode (lustrzane odbicie kontenera w lokalnym IDE); obecna strona produktu mówi o worktree. Koordynatora-agenta nie ma. [D: imbue.com/product/sculptor, odczyt 17.11.2026; docs.imbue.com, 1.03.2026]

### Superset

Elektron, potem headless serwer Hono, żeby desktop, web i telefon miały ten sam interfejs; zdalne workspace'y; skrypty setupu worktree; śledzenie zadań od issue przez agenta i diff do PR; CLI i serwer MCP, przez które agenci mogą sterować innymi agentami. Założyciele w Launch HN: „gdy masz 5-10 agentów, wąskim gardłem staje się pamiętanie, co każdy robi, i przegląd przez człowieka”. Komentujący: worktree to dopiero połowa, prawdziwy kłopot to osobne porty i infrastruktura na worktree. [D/U: news.ycombinator.com/item?id=48236770, ok. 22.05.2026]

### Orca (Stably AI)

Najbardziej jawny protokół koordynatora wśród narzędzi lokalnych. Model: Run (przestrzeń nazw + skrzynka koordynatora), Task (spec, zależności, stany pending, ready, dispatched, completed, failed, blocked), Dispatch (jedna próba zadania na terminalu, to ona ma prawo zakończyć zadanie), Message (`status`, `worker_done`, `escalation`, `question`, `heartbeat`), Decision gate (pytanie koordynatora blokujące zadanie). Worker dostaje preambułę z kontraktem: wyślij `worker_done` dokładnie raz, także przy porażce, z `--outcome`, krótkim podsumowaniem (co zrobione, co znalezione, co zostało) i oboma ID, żeby stara próba nie zamknęła nowej; pytania blokujące zadawaj przez `orca orchestration ask` (opcje, timeout), nie w lokalnym TUI. Heartbeaty domyślnie co 5 min. Koordynator czeka przez `check --wait --types worker_done,escalation,question`, przetwarza paczkę i potwierdza `--ack`. Po zakończeniu terminal workera się zwalnia, wyjście zostaje do odczytu (`worker-read`). Zagnieżdżanie workerów do głębokości 4; zatrzymanie workera zatrzymuje jego pomocników. [D: orca.dev/docs/cli/orchestration, odczyt 17.11.2026]

### T3 Code

Lokalny serwer, który uruchamia natywne CLI (Codex, Claude Code, Cursor, Grok, OpenCode, Pi) i tłumaczy ich zdarzenia na jeden interfejs: web, desktop, telefon. Statusy wątków: active, waiting, finished, settled. „Settle” zdejmuje wątek z uwagi bez kasowania; można to zrobić automatycznie po scaleniu PR. Prośba o zgodę od subagenta pojawia się w rozmowie rodzica z nazwą subagenta. Od października 2026: narzędzia MCP do przekazania worktree, kolejkowanie i sterowanie po stronie serwera, forki wątków. Koordynatora-agenta nie ma. [D/U: flaviocopes.com/t3-code, 28.08.2026; x.com/theo, 2.10.2026; release 0.1.9, 11.11.2026]

### Terragon

Martwy (agentsroom.dev, 23.06.2026, „now-dead Terragon”). Nie ustaliłem daty zamknięcia. Pomijam.

### Amp (Sourcegraph)

Task subagent dostaje instrukcje i kontekst od głównego agenta, nie całą rozmowę; subagenci nie rozmawiają ze sobą i człowiek nie steruje nimi bezpośrednio. Główny agent dostaje końcowe podsumowanie i może dać temu samemu subagentowi kolejne zadanie z jego pełnym wcześniejszym kontekstem, także w trakcie pracy, jako dodatkową instrukcję. Oracle (doradca, nigdy nie edytuje), Librarian (cudze repo) i Finder (wyszukiwanie) jako role w Task albo osobne wtyczki z wybranym modelem. Read Thread streszcza inne wątki Ampa. [D: ampcode.com/docs/models-and-subagents, 24.10.2026]

### Factory (Droids, Missions)

Najlepiej opisana architektura koordynatora z weryfikacją. Trzy role: orchestrator (planuje, dzieli, steruje do przejścia bramek, nie zbiera szczegółowego kontekstu, deleguje nawet dochodzenia), workerzy (realizują feature z jasnym kryterium sukcesu, test-first, ale nie oni decydują o poprawności), walidatorzy (sprawdzają, nie naprawiają; zgłaszają luki orchestratorowi, który tworzy zadania naprawcze). Przed jakimkolwiek featurem orchestrator pisze kontrakt walidacji: skończoną listę sprawdzalnych zachowań z narzędziem i wymaganym dowodem (np. zrzut ekranu, odpowiedź 200). Runner programowy, nie model, uruchamia workera na feature w kolejności i walidację na końcu kamienia milowego. Stan jest zewnętrzny: kontrakt, lista featurów, notatki, wytyczne, baza wiedzy. Przykładowa misja: 16,5 h, orkiestracja 2,3% czasu, walidacja 37,2%, 185 przebiegów agentów, 778,5 mln tokenów, 34% zadań to poprawki po walidacji, wszystkie 6 kamieni przeszło dopiero w 4. rundzie. Przy blokadzie orchestrator zatrzymuje misję i oddaje sterowanie człowiekowi. Osobne modele i effort dla workerów i walidatorów (flagi `--worker-model`, `--validator-model`). [D: factory.com/news/missions-architecture, 10.04.2026; docs.factory.com/missions/reference]

### Devin (Cognition)

Managed Devins (19.03.2026): główna sesja jest koordynatorem, który dzieli pracę, przydziela, monitoruje, rozwiązuje konflikty i zbiera wyniki. Każde dziecko to pełny Devin na własnej VM, testuje swoje zmiany przed raportem i ma własny link. Koordynator może pisać do dzieci w trakcie, śledzić ich zużycie ACU, usypiać je i zabijać, planować wiadomości do siebie (kontrolne punkty) oraz czytać pełne trajektorie dzieci, żeby lepiej dzielić następne zadanie. [D: cognition.ai/blog/devin-can-now-manage-devins]

Dynamic workflows: Devin pisze deterministyczny skrypt Pythona (`agent()`, `pipeline()`, `parallel()`, `log()`), który decyduje, którzy agenci ruszają i co dostają. Każde `agent()` zwraca dane według JSON Schema. Każde wywołanie jest nagrywane pod kluczem z hasha promptu, schematu i ustawień, więc przerwany przebieg można wznowić: skończone wywołania odtwarzają się z zapisu. Agent domyślnie na osobnej VM (wymiana przez gałęzie), opcjonalnie na wspólnej (wtedy piszący muszą mieć rozłączne pliki). Rada: workflow dla około 5+ niezależnych jednostek z krokiem zbiorczym albo potoku audyt-naprawa-weryfikacja; dla 1-2 zadań wystarczy zwykła sesja. [D: docs.devin.ai/work-with-devin/dynamic-workflows, 13.10.2026]

### Google Jules

Brak koordynatora: każde zadanie to osobna VM i plan do zatwierdzenia. Jeśli nikt nie odpowie, plan zatwierdza się po czasie, a od 26.01.2026 auto-zatwierdzone plany przegląda drugi agent, Planning Critic; Google podaje 9,5% mniej nieudanych zadań. Najwyższy plan: 300 zadań dziennie, 60 równolegle. [D: jules.google/docs/changelog/2026-01-26-1; jules.google]

### Warp (Oz)

Oz (10.02.2026) to platforma do agentów w chmurze, wiele harnessów (Claude Code, Codex, Warp Agent). `/orchestrate` najpierw pokazuje propozycję: ilu dzieci, prompt i środowisko każdego, czego oczekuje w odpowiedzi; dopiero po zatwierdzeniu startuje. Nad widokiem agenta pasek „pigułek”: rodzic i po jednej na dziecko z nazwą i statusem, kliknięcie przełącza widok w miejscu. API daje stan, `parent_run_id`, artefakty (PR, plany, zrzuty), znormalizowaną rozmowę i transkrypt. Anulowanie rodzica celowo nie anuluje dzieci. [D: docs.warp.dev/platform/orchestration/multi-agent-runs, 19.10.2026]

### OpenHands

SDK ma Task Tool Set do delegacji. Badawczy system CAID (CMU, 27.04.2026): manager buduje graf zależności, każdy inżynier dostaje worktree i zadanie w ustrukturyzowanym JSON-ie, po zakończeniu manager scala gałąź, rozwiązuje konflikty i aktualizuje plan. Komunikacja tylko przez JSON i commity, nie przez rozmowę. Wynik: +14,3 pkt na Commit0 i +26,7 pkt na PaperBench względem jednego agenta; usunięcie izolacji worktree mocno obniża wynik; więcej agentów niż równoległych węzłów w grafie nie pomaga; jeden agent z większym budżetem kręci się w kółko. W produkcie brak widoku wszystkich agentów naraz (zgłoszenie #18057, 6.10.2026). [D: openhands.dev/blog/asynchronous-software-engineering-agents; arXiv 2603.21489]

### cmux

Terminal na Ghostty: workspace na zadanie, w pasku bocznym gałąź, katalog, porty i ostatnia linia wyjścia; gdy agent kończy albo pyta, panel dostaje „pierścień” i licznik nieprzeczytanych; powiadomienia z hooków agentów; wszystko sterowalne przez CLI i gniazdo Unix. Koordynatora nie ma. [D: cmux.com/agents, odczyt 17.11.2026]

### Zed

Parallel Agents (22.04.2026): Threads Sidebar grupowany po projekcie, status i agent przy każdym wątku, mieszanie agentów (własny, zewnętrzne przez ACP, wątki terminalowe), worktree na wątek, archiwum i przywracanie razem z worktree. Koordynatora nie ma. [D: zed.dev/docs/ai/parallel-agents]

### Kiro (AWS)

W IDE „Run all Tasks” buduje graf z listy zadań speca: zadania piszące do tych samych plików nigdy nie idą równolegle, setup najpierw, testy po kodzie, reszta w falach; porażka jednego nie zatrzymuje innych. [D: kiro.dev/blog/faster-smarter-specs] W Crew: panel Activity ze stanami running, done, failed, stalled; wynik subagenta sam trafia do rozmowy; zatrzymanie to stan neutralny („stopped by user”), nie porażka; „cisza sama w sobie nie dowodzi, że praca się skończyła”; trwała kolejka zadań przeżywa restart, a niepewne skutki uboczne nie są powtarzane po cichu; limit równoległości liczony z pamięci i CPU hosta, odmowa spawnu przy braku zasobów to sygnał, nie błąd do ponawiania. Bramka delegacji: pojedynczy subagent jest odrzucany, chyba że model poda powód (`parent_parallel`, `bulk_data`, `fresh_context`, `specialist`, `user_requested`), zapisany w rekordzie jako twierdzenie modelu. [D: kiro.dev/docs/crew/features/subagents, 30.09.2026]

### Dodane: GitHub Agent HQ

Mission control (28.10.2025, rozwinięte w 2026): przydzielanie zadań agentom różnych dostawców w wielu repo, logi sesji na żywo, pauza, doprecyzowanie, restart, przejście do PR. Poradnik GitHuba wymienia sygnały dryfu do obserwowania: padające testy, nieoczekiwane pliki w diffie, rozrost zakresu, złe zrozumienie intencji, kręcenie się w kółko; i zaleca grupować przegląd podobnych zmian. [D: github.blog, 1.12.2025]

### Dodane: Gas Town (Steve Yegge)

Wydany 1.01.2026. Mayor dzieli dzień pracy na zadania w trackerze Beads, pakuje je w convoy i wysyła do repo (rig); polecaty (wymienne workery) pracują w worktree. Skrzynki w stylu Erlanga dla długo żyjących agentów; handoff, czyli przekazanie stanu nowemu workerowi, gdy kontekst przekroczy próg (autor podaje spadek jakości już przy ~60%). Deacon patroluje system, sprząta zombie i restartuje zawieszone sesje; Witness pilnuje agentów w rigu i zastępuje stojących; Refinery scala i pilnuje jakości. „Sweeps”: godzinny przegląd przez człowieka zamienia się w zadania korygujące dla agentów. Wymaga kilku planów Max. [D/U: heise.de, 21.02.2026] Armin Ronacher nazwał to „kultem Mad Maxa”. [U: lucumr.pocoo.org, 18.01.2026]

### Dodane: Paperclip

Agenci w schemacie organizacyjnym z celami od misji do zadania; heartbeaty (agent budzi się co N godzin albo po przydzieleniu ticketu); tickety z pełnym śladem i dziennikiem tylko do dopisywania; budżet miesięczny na agenta z ostrzeżeniem przy 80% i automatyczną pauzą przy 100%; człowiek jako zarząd zatwierdza nowe zatrudnienia i strategię. [D: paperclip.ing, odczyt 17.11.2026]

### Dodane: Foremerge

Warstwa nad git: przed edycją agent publikuje intencję i zakres (`symbol:PaymentService=replace`), a druga sprzeczna intencja dostaje ostrzeżenie HIGH, zanim powstanie kod. Dzierżawy doradcze, nie blokady. Przed przyjęciem pracy system sam uruchamia skonfigurowany check na dokładnym stanie git; deklaracja agenta „testy przechodzą” jest zapisywana, ale bramki nie spełnia. [D/U: Show HN, ok. 21.09.2026]

### Frameworki i wzorce

- Anthropic, „How we built our multi-agent research system” (13.06.2025): lead (Opus 4) + równoległe subagenty (Sonnet 4) wypadły o 90,2% lepiej niż pojedynczy Opus 4 na wewnętrznym benchmarku. Zużycie tokenów tłumaczyło ~80% wariancji wyników; system zużywa ~15x więcej tokenów niż czat. Wnioski: naucz lidera delegować (cel, format wyniku, narzędzia i źródła, granice zadania), bo bez tego subagenci dublowali pracę; skaluj wysiłek do złożoności (proste: 1 agent i kilka wywołań, porównania: 2-4 subagentów, złożone: 10+); wcześnie lider odpalał 50 subagentów do prostych pytań; lider zapisuje plan do pamięci, bo kontekst bywa ucinany; subagenci zapisują wyniki do plików zamiast przepuszczać wszystko przez lidera („gra w głuchy telefon”); synchroniczne czekanie na wszystkich to wąskie gardło. [D]
- LangGraph: biblioteka `langgraph-supervisor` istnieje, ale dokumentacja LangChain zaleca dziś supervisora przez wywołania narzędzi (agenci jako narzędzia), bo daje więcej kontroli nad kontekstem. [D: reference.langchain.com/python/langgraph-supervisor]
- OpenAI Agents SDK: dwa wzorce, agenci jako narzędzia (menedżer zachowuje rozmowę i składa wyniki) i handoffs (specjalista przejmuje turę); obok orkiestracja kodem (structured outputs, łańcuchy, pętla wykonawca-ewaluator, `asyncio.gather`). [D: openai.github.io/openai-agents-python/multi_agent]
- Claude Agent SDK: subagenci tak, ale agent teams w trybie nieinteraktywnym i w SDK nie startują. [D: dokumentacja agent teams]

### Co mówią użytkownicy

- „Dwie równoległe sesje to mój limit, potem mózg się rozpada w kilka minut.” Odpowiedzi: 3 worktree to maksimum przy pełnym cyklu (ticket, plan, review przez drugą instancję, CI), 5-10 tylko przy małych, atomowych zadaniach. [U: HN Ask HN, 30.03.2026]
- Trzy aktywne czaty to granica; limit równoległych agentów = liczba diffów, które zdążę przejrzeć tego samego dnia, bo nieprzejrzany diff „czerstwieje” i połowę trzeba puścić od nowa; stały plik na tor pracy (cel, stan, blokada, następny krok) czytany na starcie sesji; nie zaczynać nowego toru w ostatniej godzinie okna limitu, bo tor w tle zjada kwotę sesji, w której pracujesz. [U: r/ClaudeAI, 18.09.2026]
- Koordynator w chmurze (Projects): świetna koordynacja, ale 40-50% tokenów na samą koordynację. Lokalny koordynator: ~10%, za to nie reaguje sam na wiadomości od innych sesji, trzeba go „szturchać, żeby szturchnął workerów”. Obejście: workery kończą `STATUS: DONE` albo `STATUS: BLOCKED`, skrypt w tle to wykrywa i budzi koordynatora; handoff przy ~250k kontekstu. Odpowiedź innego użytkownika: worker budzony zdarzeniem adresowanym do niego, koordynator tylko trzyma kolejkę i nie przekazuje wiadomości. [U: r/ClaudeCode, 7.11.2026]
- „Agenci gubią się w worktree, konflikty git na każdym kroku, administracja zjada zysk.” [U: HN, 24.04.2026]
- Najgroźniejsze konflikty to nie te same linie, tylko sprzeczne zmiany architektury (jeden agent zastępuje klasę, drugi ją rozszerza). [U: HN Foremerge, 09.2026]
- Dziesięć agentów naraz odpaliło `tsc`, load 37, 87 MB wolnego RAM, typecheck z 90 s urósł do 7,5 min; pomogła wspólna blokada. [U: blog agentsroom.dev, tytuł i lead, bez weryfikacji pomiaru]

## Wzorce warte skopiowania

1. Koordynator, który nie wykonuje. Cursor Projects i Factory mówią to wprost: koordynator planuje i deleguje, nawet dochodzenia oddaje subagentom. Claude Projects: koordynator widzi raporty wątków, nie ich kroki, i pracuje na ostatnich wiadomościach oraz pamięci projektu. Dlaczego działa: kontekst koordynatora zostaje czysty, więc nie traci wątku po kilku dniach, a człowiek zawsze ma z kim porozmawiać, bo koordynator nie siedzi w długim zadaniu. [D] [W] Dla Threadbear: wątek-koordynator bez prawa edycji plików, z narzędziami `create_thread`, `send_message`, `read_thread`.

2. Stany według tego, czego potrzebuje człowiek. Claude Projects: Ready for review, Waiting on you (razem z błędami), Working, Landing, Idle, Resolved z automatycznym zamknięciem po tygodniu; T3 Code: „settle” po scaleniu PR. Dlaczego działa: człowiek pyta „co ode mnie zależy”, a nie „który proces żyje”; błąd i pytanie lądują w jednym koszyku, bo wymagają tej samej reakcji. [D] Dla Threadbear: Inbox już to robi dla pojedynczych wątków; koordynator może składać ten sam podział dla swoich dzieci.

3. Jedna linia, która mówi, co się dzieje albo o co pyta. Agent view: podsumowanie wiersza od modelu klasy Haiku, w trakcie pracy z wyjścia sesji bez kosztu, na końcu tury nowe, a wiersz zablokowany pokazuje samo pytanie. cmux: ostatnia linia wyjścia. Dlaczego działa: człowiek decyduje, czy otworzyć wątek, bez czytania transkryptu. [D]

4. Twardy kontrakt zakończenia. Orca: `worker_done` dokładnie raz, także przy porażce, z `outcome`, podsumowaniem „zrobione, znalezione, zostało”, listą zmienionych plików i ID próby, żeby stara próba nie zamknęła nowej. Devin i Claude dynamic workflows: wynik według JSON Schema. Użytkownicy: `STATUS: DONE/BLOCKED`. Dlaczego działa: koordynator nie musi zgadywać z prozy, czy wątek skończył, i nie myli ponowienia z oryginałem. [D] [U] Dla Threadbear: `end_turn` z `needs` to już połowa takiego kontraktu; brakuje wyniku w ustalonej formie i identyfikatora zlecenia.

5. Push, nie poll, i budzenie zdarzeniem. Agent teams: teammate po zakończeniu sam zgłasza się leadowi z końcową odpowiedzią. Kiro: „nie musisz sprawdzać, wyniki przychodzą do ciebie”. Cross-session messaging: bezczynna sesja dostaje nową turę. Cursor: subskrypcje na Slack, PR, CI, harmonogram. Paperclip: przydział ticketu budzi agenta. Dlaczego działa: koordynator nie pali tokenów na sprawdzanie i nie trzeba go szturchać. [D] [U]

6. Heartbeat i wykrywanie zawieszeń, które nie zabija na ślepo. Orca: heartbeat co 5 min (konfigurowalny). Kiro: wiersz „stalled”, ale cisza nie jest dowodem końca. Agent view: nadzorca restartuje sesję, która przestała odpowiadać, i ta kontynuuje przerwaną odpowiedź. Gas Town: Witness i Deacon. Dlaczego działa: długie budowy i testy są ciche, więc „brak zdarzeń przez X minut” ma oznaczać „sprawdź”, a nie „zabij”. [D]

7. Pytania przez koordynatora, z opcjami. Orca: `ask` z listą opcji i timeoutem zamiast pytania w lokalnym TUI; bramki decyzyjne blokujące konkretne zadanie. Codex: prośba o zgodę z etykietą wątku źródłowego i skrótem do niego. T3 Code: zgoda subagenta w rozmowie rodzica z nazwą. Dlaczego działa: człowiek odpowiada w jednym miejscu, wie, kogo dotyczy decyzja, a zamknięte opcje dają się odpowiedzieć jednym kliknięciem, także z telefonu. [D]

8. Zgoda człowieka nie przechodzi przez agenta. Claude: teammate nie może zgodzić się za człowieka ani przekazać odmowy dalej, a w trybie auto „zgoda” od innego agenta to niezaufane wejście. Cursor: wiadomość od agenta kolegi oznaczona jako wejście agenta, odpowiada boczny czat bez uprawnień. Dlaczego działa: koordynator z narzędziem do pisania do innych wątków to inaczej prosta droga do obejścia uprawnień. [D] Dla Threadbear: `send_message` od koordynatora powinien docierać oznaczony jako od agenta, nie od Michała.

9. Niezależny sprawdzający i kryteria przed kodem. Factory: kontrakt walidacji spisany przed featurami, walidatorzy w świeżym kontekście nie naprawiają, tylko zgłaszają; walidacja to 37% czasu misji. Jules: Planning Critic na auto-zatwierdzonych planach (-9,5% porażek). Foremerge: check uruchamia system, deklaracja agenta nie wystarcza. Dlaczego działa: wykonawca ma skrzywienie potwierdzające swoją pracę, a kryteria pisane po implementacji dopasowują się do niej. [D]

10. Izolacja i integracja przez git jako protokół. CAID: worktree na inżyniera, manager scala, komunikacja tylko JSON-em i commitami; bez izolacji wynik wyraźnie spada. Devin: osobna VM, wymiana gałęziami. Kiro: zadania na tych samych plikach nigdy równolegle. Dlaczego działa: konflikty wychodzą przy scaleniu, jawnie, a nie jako ciche nadpisanie. [D] Dla Threadbear: worktree na wątek i `tb land` z kolejką już są; koordynator powinien z nich korzystać, a nie wymyślać własne.

11. Kontekst raz, czytany przez każdy wątek. Claude Projects: instrukcje projektu (twarde) i pamięć projektu (preferencje). Cursor: wspólny Context store, do którego agenci dopisują, czego się nauczyli. Factory: stan zewnętrzny w plikach. Użytkownicy: plik toru (cel, stan, blokada, następny krok). Dlaczego działa: brief każdego wątku jest krótszy, a wiedza nie ginie przy kompakcji. [D] [U] Dla Threadbear: projekty z celem, stanem i notatkami już istnieją; koordynator może być ich właścicielem.

12. Orkiestracja kodem dla szerokiego fan-outu, z nagrywaniem i wznawianiem. Devin dynamic workflows: skrypt decyduje o agentach, każde wywołanie nagrane pod hashem, przerwany przebieg wraca od miejsca przerwania. OpenAI SDK: „orchestrating via code” dla przewidywalności kosztu i czasu. Dlaczego działa: przy 20+ jednostkach model w pętli gubi się i drożeje, a skrypt jest powtarzalny. [D]

13. Plan fan-outu do zatwierdzenia przed startem. Warp `/orchestrate`: liczba dzieci, prompt i środowisko każdego, oczekiwany wynik, dopiero potem start. Claude Projects: „proponuj wątki i czekaj na moją zgodę” na początek, potem bez pytania. Dlaczego działa: zła dekompozycja jest najdroższym błędem, a jej przegląd zajmuje minutę. [D]

14. Bramka i skala delegacji. Kiro: pojedynczy subagent wymaga uzasadnienia z listy powodów. Anthropic: reguły skali wysiłku do złożoności. Claude: 3-5 teammate'ów na start. Kiro: limit z zasobów hosta i odmowa jako back-pressure. Dlaczego działa: bez tego model dzieli zadania, których nie warto dzielić, i zapycha maszynę. [D] Dla Threadbear: równoległe `check.sh` i buildy już raz zatkały Maca Michała (AGENTS.md, 6 i 9.11).

15. Model, effort i budżet na rolę. Factory: osobne modele dla workerów i walidatorów. Claude Projects: koordynator low effort, wątki high. Paperclip: budżet na agenta, ostrzeżenie 80%, pauza 100%. Devin: zużycie ACU na dziecko widoczne dla koordynatora. Dlaczego działa: koordynacja to mało tokenów i dużo osądu, wykonanie odwrotnie; twardy limit zatrzymuje ucieczkę kosztów zanim ktoś ją zauważy. [D]

## Antywzorce

1. Koordynator jako przekaźnik. Wszystko przez niego, w obie strony: 40-50% tokenów na koordynację i głuchy telefon. Lepiej: wątki zapisują wyniki do plików lub stanu, koordynator trzyma kolejkę. [U: r/ClaudeCode, 7.11.2026] [D: Anthropic]

2. Koordynator, którego trzeba budzić ręcznie. Jeśli nie reaguje na zdarzenia od wątków, człowiek wraca do roli koordynatora. [U: r/ClaudeCode, 7.11.2026]

3. Niewidoczny brief. Codex multi-agent v2 szyfruje zlecenia i operator nie wie, czy zawiódł rodzic, czy dziecko. Dokładna treść zlecenia i każdej dalszej wiadomości musi być do odczytania. [D: issue #32753]

4. Zgoda w złym miejscu. W Claude Projects „idź dalej” w rozmowie projektu nie odblokowuje wątku, trzeba wejść w wątek. To bezpieczne, ale człowiek łatwo myśli, że odpowiedział. [D] [W] Lepiej: pytanie wątku widoczne i odpowiadalne tam, gdzie człowiek patrzy, z jawną informacją, do kogo trafia odpowiedź.

5. Pisanie wielu agentów w jednym katalogu. Agent teams nie dają worktree; CAID pokazuje spadek bez izolacji; Kiro nigdy nie puszcza równolegle zadań na tych samych plikach. [D]

6. Ufanie samoocenie. „Testy przechodzą” od agenta i ocena własnej pracy przez wykonawcę. [D: Factory, Foremerge]

7. Równoległość ponad przegląd. Więcej wątków niż człowiek przejrzy w ciągu dnia produkuje czerstwe diffy i powtórki; Anthropic zaczynał od 50 subagentów do prostych pytań. [U] [D]

8. Limity jako prośba. Claude Projects: „najwyżej dwa wątki” zapisane w pamięci to nie twardy limit. Limity współbieżności i budżetu powinien egzekwować runner, nie model. [D] [W]

9. Anulowanie rodzica bez dzieci. Warp celowo nie anuluje dzieci; Orca zatrzymuje pomocników razem z workerem. Domyślnie powinno być „zatrzymaj drzewo”, a „zostaw dzieci” jako świadoma opcja. [D] [W]

10. Ciche zgadywanie zamiast pytania. Claude Projects ma osobny rozdział „Threads guessed or stalled instead of asking”. Brief powinien mówić, kiedy pytać, a kontrakt dawać tani sposób zapytania. [D]

11. Wymiana zasobów maszyny bez kontroli. Dziesięć `tsc` naraz, load 37. Kiro liczy limit z zasobów hosta. [U] [D]

12. Zależność od cudzej chmury. Vibe Kanban stracił współpracę po zamknięciu firmy, Terragon zniknął, Crystal wycofany. [U] [W] Threadbear ma tu przewagę: stan na Macu, Convex jako lustro.

13. Anchoring przy debugowaniu. Jeden agent znajduje pierwsze wiarygodne wyjaśnienie i przestaje szukać; dokumentacja Claude zaleca kilku teammate'ów z konkurencyjnymi hipotezami, którzy próbują obalić się nawzajem. [D]

## Co z tego wynika dla Threadbear (własne wnioski)

- Rdzeń już jest: wątki z własnym worktree, `create_thread`, `send_message`, `read_thread`, `schedule_message`, `end_turn` z `needs`, Inbox, projekty z celem i stanem, `tb land` z kolejką. Brakuje warstwy, która z tego robi koordynatora: relacja rodzic-dziecko, kontrakt zakończenia, stany dzieci dla człowieka, limity egzekwowane przez runner. [W]
- Najtańszy duży zysk: zakończenie wątku-dziecka automatycznie budzi rodzica z ustrukturyzowanym wynikiem (wzorce 4 i 5) zamiast kazać koordynatorowi czytać wątki. [W]
- Najważniejsza decyzja projektowa: czy koordynator to zwykły wątek z dodatkowymi narzędziami (jak Claude i Cursor Projects), czy osobny byt runnera (jak Orca Run z Dispatchami). Z porównania wychodzi hybryda: rozmowa z modelem do planowania i rozmowy z Michałem, a stan zadań, limity, heartbeaty i zamykanie drzewa w runnerze. [W]

## Luki w researchu

- Ghostex świadomie pominięty (osobny wątek).
- Nie zweryfikowałem daty zamknięcia Terragona ani obecnego stanu Crystal/Nimbalyst poza jednym źródłem.
- Superset: brak dokumentacji o koordynatorze-agencie; opieram się na Launch HN i README. Skill `superset-sh/skills` (sterowanie agentami przez CLI i MCP) nie został przeczytany.
- Codex cloud (zadania w chmurze ChatGPT) i GitHub Agent HQ z 2026 r. opisane skrótowo; nie czytałem ich bieżącej dokumentacji.
- Kiro autonomous agent (chmura) i Jules: brak szczegółów o wykrywaniu zawieszeń.
- Gas Town: opis z artykułu heise i nazw plików w repo, nie z kodu; nie wiem, jak dokładnie Witness rozpoznaje „lenistwo”.
- Post Anthropic o systemie badawczym streszczam z pamięci i ze streszczeń w wynikach wyszukiwania; liczby (90,2%, ~80% wariancji, ~15x tokenów) warto potwierdzić w oryginale przed cytowaniem.
- Opinie z Reddita i HN to pojedyncze relacje, nie pomiary; liczba 40-50% narzutu koordynacji pochodzi od jednego użytkownika.
- Nie testowałem żadnego narzędzia własnoręcznie.
