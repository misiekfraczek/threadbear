# 04 - Plan implementacji koordynatora w Threadbear

Stan na 17.11.2026. Złożone z: `01-ghostex.md`, `02-inne-ade.md`, `02b-t3code.md`, `02c-anthropic-fold-subagents.md`, `03-threadbear.md`. Odwołania L1-L10 to luki z `03-threadbear.md`, sekcja 3.

Cel: najlepszy koordynator z dostępnych ADE, przy jak najmniejszym rozjeździe z upstreamem Mike'a (fork bierze jego wydania; od 1.11 upstream ma 464 commity w `runner.ts`, `threadbear-mcp.ts` i `docs/protocol.md`).

## 1. Decyzje projektowe

1. **Koordynator to zwykły wątek z playbookiem, a nie osobny byt runnera.** Tak robią Claude Code Projects, Cursor Projects i T3 Code (każdy wątek może delegować, `02b` sekcja 0). Ghostex zbudował osobny byt i potrzebował do tego 27 tys. linii w siedem tygodni (`01` wstęp). Stan zadań, limity i pilnowanie zawieszeń trafiają do runnera i patchy; rozmowa i osąd zostają w modelu.
2. **Delegacja według kontekstu, a nie zawsze.** Zastępuje zasadę Ghostex „koordynator nic nie robi sam”. Wątek startuje tylko wtedy, gdy praca jest równoległa i niezależna, zapchałaby kontekst koordynatora, wymaga świeżej oceny (przegląd), dzieje się w innym folderze lub z innymi uprawnieniami albo Michał chce ją puścić w tle. W pozostałych przypadkach koordynator robi to sam (`02c`, Anthropic; `02b`: „Fix small review findings yourself”).
3. **Bez wątków-ról.** Ciąg research, plan i implementacja w jednym obszarze to jeden wątek kontynuowany przez `send_message`, a nie trzy przekazania (`02c` p. 2).
4. **Pytania dzieci idą do koordynatora, zgody i sekrety do Michała.** To rozdział z T3 Code (`02b` 2.4). Koordynator odpowiada sam, gdy odpowiedź wynika z briefu lub ustaleń, inaczej pyta Michała jedną kartą. Zgody nigdy nie przechodzą przez agenta (`02` wzorzec 8).
5. **Push zamiast pollingu, budzenie przy każdym zakończeniu, także przy błędzie.** Fundament u wszystkich najlepszych (`01` p. 1, `02b` p. 3). Dziś `waitFor` tego nie robi (L1, L2): naprawiamy to tymczasowo w playbooku i harmonogramie, a docelowo PR-em do Mike'a.
6. **Sygnały strukturalne zamiast heurystyk prozy.** Ghostex parsuje angielskie zdania („I'll”, „let me”) i sam przyznaje, że to kruche (`01` sekcja 5, p. 2); u nas, po polsku, nie zadziałałoby wcale. Stan bierzemy z pól (`status`, `needsYou`, `asks`, `lastSeq`) i ze stałego schematu raportu.
7. **Nie budujemy na `heldReports`, `nestedThreads` ani hibernacji z `quietInbox`.** Mike 16.11 wyłączył u siebie `nestedThreads` „while he rethinks coordinators” i usunął hibernację startera (`03` sekcja 4). Zapowiada też osobny eksperyment koordynatorów: obserwujemy go i nie dublujemy.
8. **Zmiany w forku tylko w nowych plikach i patchach.** Wszystko, co dotyka `runner.ts`, `threadbear-mcp.ts` lub sidebaru, idzie do Mike'a jako issue lub PR.

## 2. Etap 0: playbook v2, schemat raportu, eval (bez kodu)

Na podstawie `02c`. Wyniki evalu decydują, które zmiany w runnerze są warte pracy.

### 0.1 Playbook v2 (`~/.agents/skills/koordynator/`)

Zmiany względem wersji z 17.11:

- **Poprawka błędu:** usunąć zdanie, że wątek, który padnie albo zostanie zatrzymany, budzi koordynatora od razu. Tak jest tylko przy wstrzymanych `send_message` (`03` 1.2). Zamiast tego zawsze `waitFor` z `snooze` (np. `"60m"`) jako bicie serca: po pobudce koordynator sprawdza stan dzieci przez `tb list --all --json` (filtr `startedBy.threadId`), ocenia i ponownie zasypia.
- Reguła delegacji według kontekstu (decyzja 2) i zakaz wątków-ról (decyzja 3).
- Rozróżnienie zadania i wątku dla Michała: `nested: true` to zadanie, które musi zaraportować; `nested: false` to wątek, z którym Michał rozmawia sam i który nic nie raportuje (`02b` p. 4).
- Wątki zawsze jako link `thread:<id>`, nigdy samym tytułem (`02b` p. 7; upstream 0814b8ea).
- Po pobudce: przejrzeć `asks` dzieci z `needs: "you"` i odpowiedzieć przez `send_message`, gdy odpowiedź jest już ustalona.
- Stop całego drzewa: gdy Michał mówi „stop”, koordynator przerywa każde swoje dziecko (`interrupt_thread`). Domyślnie zatrzymujemy całe drzewo (`02` antywzorzec 9).
- Limit równoległości: najwyżej 3 wątki naraz, 5 przy małych, atomowych zadaniach. Realny limit to liczba diffów, które Michał przejrzy jednego dnia (`02` „Co mówią użytkownicy”).
- Plan rozbicia do akceptacji przed startem większej pracy (`02` wzorzec 13). Po kilku udanych sesjach Michał może to wyłączyć notatką w projekcie.
- Lekka weryfikacja na faktach zamiast „nigdy nie sprawdzaj”: koordynator patrzy na tani dowód (diff, wynik testu, zrzut, link), ale pracy nie powtarza (`02c` p. 4). Przy pracy ryzykownej osobny wątek-recenzent w trybie `ask` (`02` wzorzec 9).
- Progressive disclosure: `SKILL.md` krótki (rola, reguła delegacji, brief, raport, pętla czekania), rzadkie rzeczy w `references/` (dobór modeli, Linear, leczenie wątków, przypadki brzegowe).

### 0.2 Schemat raportu wątku

Doklejany do każdego briefu. Kształt jak u Orca `worker_done` i w „STATUS: DONE/BLOCKED” z praktyki (`02` wzorzec 4):

```
STATUS: DONE | BLOCKED | FAILED | PARTIAL
WYNIK: 1-3 zdania
SPRAWDZONE: co i jak (polecenie, test, zrzut)
NIESPRAWDZONE: czego nie dało się sprawdzić i dlaczego
PLIKI: zmienione ścieżki, commit (jeśli był)
PYTANIA: Q z 2-4 opcjami i rekomendacją (tylko przy BLOCKED/PARTIAL)
W TLE: co jeszcze biegnie (job, build) albo „nic”
```

Raport to pierwsza linia końcowej odpowiedzi wątku, więc trafia do pobudki `waitFor` (limit 2000 znaków, `03` 1.2). `W TLE` łapie przypadek Ghostex G7h13: wątek kończy turę, choć wciąż „wisi mu” praca (`01` C3), bez parsowania prozy.

### 0.3 Eval koordynatora

Plik `docs/coordinator-design/eval/cases.md`, 8-10 przypadków z życia Michała, każdy z rubryką. Format jak w T3 Code: zły przypadek, reguła, źródło i data (`02b` 2.7):

1. Bugfix w jednym repo (powinien zrobić sam albo jeden wątek).
2. Research rynkowy w 3 niezależnych kierunkach (3 wątki równolegle).
3. Raport dla klienta z danych i tekstu (jeden wątek; bez rozbijania na role).
4. Trzy poprawki w różnych plikach jednego repo (kolejno albo w worktree, bez konfliktów).
5. Zadanie, w którym wątek trafia na pytanie (pytanie wraca przez koordynatora, nie kartą dziecka).
6. Wątek, który pada albo zostaje zatrzymany (koordynator dowiaduje się w ciągu godziny).
7. Zadanie z sekretem lub zgodą (karta trafia do Michała z linkiem do wątku).
8. „Stop wszystko” w trakcie (całe drzewo zatrzymane).
9. Szybkie pytanie o status (bez nowego wątku).
10. Prośba o 6 równoległych wątków (koordynator ogranicza i mówi dlaczego).

Warianty: zwykły wątek, playbook v1, playbook v2; każdy przypadek dwa razy. Mierzymy: wynik według rubryki, czas, zużycie limitu (Usage w Threadbear), liczbę pytań do Michała, liczbę pobudek koordynatora i przypadki, w których wynik się odwrócił. Model tani (Sonnet lub Haiku) do przebiegów playbooka, zgodnie z zasadą Mike'a o testach na najtańszym modelu.

**Gotowe, gdy:** v2 wygrywa z v1 w przypadkach 5, 6, 8 i 9 i nie przegrywa w żadnym, a wyniki są zapisane w `eval/wyniki-<data>.md`.

## 3. Etap 1: bez forka (patch, harmonogram, projekt)

### 1.1 Panel „Praca koordynatora” (patch w `~/.threadbear/patches/`)

- `when`: wątek ma dzieci (`tb list --all --json`, `startedBy.threadId == threadId`) albo tytuł zawiera „koordynator”.
- `items`: dzieci w sekcjach „Czeka na Ciebie”, „Pracuje”, „Śpi”, „Zrobione dziś”; `tone` z `needsYou` i błędu, `trailing` = czas od ostatniej aktywności, `detail` = pierwsze ask albo linia STATUS z raportu. Na górze pozycje W1… ze `state` projektu.
- `badge` = liczba dzieci czekających na Michała; `summary` = karta w Highlights („2 pracują, 1 czeka na Ciebie”).
- Ograniczenie: kliknięcie wiersza nie otworzy wątku (`03` 2.2). Do czasu L3 `detail` pokazuje tytuł, a karta asks koordynatora zawiera link `thread:`.
- **Gotowe, gdy:** panel pokazuje dzieci koordynatora z eval 2 w ciągu 20 s od zmiany stanu, a `tb list` nie spowalnia Inboxu (pomiar czasu wywołania przy obecnej liczbie wątków).

### 1.2 Strażnik zawieszeń (harmonogram z `check`)

- Koordynator przy pierwszym starcie dziecka zakłada `schedule_message` z `cron` co 10 min do samego siebie i z `check` (skrypt w `~/.agents/bin/koordynator-straznik`, `tb` pełną ścieżką; `03` 2.4).
- Check zapisuje `lastSeq` pracujących dzieci w `$THREADBEAR_CHECK_STATE` i drukuje tylko te, których `lastSeq` stoi dłużej niż 20 min. Pusty wydruk oznacza brak tury i zero kosztu.
- Bezpieczniki z Ghostex (`01` C4-C7): nie zgłaszać drugi raz tego samego wątku, dopóki nie ruszy; stan limitu (konto bez miejsca) to czekanie, nie zawieszenie; dziecko czekające na kartę lub pytanie nie jest zawieszone.
- Koordynator po zgłoszeniu robi to, co playbook mówi o leczeniu (`read_thread`, `interrupt_thread`, „kontynuuj”), a Michałowi mówi tylko o przerwaniu albo nieudanym leczeniu. Harmonogram usuwa, gdy nie ma już pracujących dzieci.
- Playbook dostaje wyjątek od zakazu `schedule_message` do podglądania.
- **Gotowe, gdy:** w eval 6 (sztucznie zawieszona komenda, np. `sleep 3600` w wątku) koordynator dostaje zgłoszenie w ciągu 30 min, a w spokojnej sesji nie ma ani jednej zbędnej tury.

### 1.3 Lista pracy

- Pozycje W1… w `state` projektu (limit 2000 znaków, ok. 15-25 linii, `03` 2.5), jedna linia na pozycję, zastępowana.
- Linear tylko dla pozycji, które już mają task albo przeżyją sesję. Pełna tablica z Linear zamiast Notion to Etap 3 (L9), jeśli `state` okaże się za mały.

## 4. Etap 2: małe PR-y do Mike'a

Kolejność według wartości i zgodności z kierunkiem upstreamu. Najpierw issue z opisem problemu i danymi z evalu (CONTRIBUTING.md w upstreamie od 17.11), potem PR.

| Kolejność | Zmiana | Luka | Wielkość | Dlaczego Mike może chcieć |
|---|---|---|---|---|
| 1 | `waitFor` budzi przy błędzie, zatrzymaniu i `needs: "you"` dziecka; status w tekście pobudki | L1 | mała | Błąd widoczny dla każdego czekającego wątku, nie tylko koordynatora |
| 2 | `waitFor` w trybie „pierwszy”, z doklejaniem kolejnych zakończeń do czekającej pobudki | L2 | mała | Wzorzec kohort z T3 (`02b` 2.2); mniej pobudek niż osobna na każde dziecko |
| 3 | Wiersz panelu z `thread:<id>` otwiera wątek | L3 | bardzo mała | Ogólna funkcja patchy, 10-20 linii |
| 4 | Wynik `create_thread` z podpowiedzią „zakończenie cię obudzi, nie odpytuj” | - | bardzo mała | Jedno zdanie w wyniku, nie w opisie narzędzia; budżet kontekstu bez zmian (`02b` p. 3) |
| 5 | Zawieszona tura w `stuck-jobs.ts` (dziś łapie tylko zadania w tle) | L10 | średnia | Rozszerza istniejący mechanizm; pomaga każdemu wątkowi, nie tylko koordynatorom |
| 6 | Filtr „moje dzieci” i `waitingOn`/ask w `list_threads` | L4 | mała | Do czasu przyjęcia wystarcza `tb list --json` |

Po przyjęciu 1 i 2 strażnik z 1.2 zostaje tylko na zawieszone tury, a bicie serca w playbooku można wydłużyć.

## 5. Etap 3: tylko w forku, tylko jeśli eval pokaże potrzebę, a Mike odmówi

- Moduł stall watch w nowym pliku runnera (gdy 1.2 okaże się za wolny albo za drogi).
- Tablica pracy z Linear zamiast Notion (L9): nowy plik obok `notion-tasks.ts`.
- Wątki read-only w Plan mode Claude (dziś tylko `permissionMode: "ask"`).
- Akcje w wierszach panelu, np. „Przerwij” i „Kontynuuj” (L5): raczej propozycja do Mike'a niż fork.

## 6. Czego nie robimy

- Osobnego bytu „koordynator” w runnerze, main coordinatora projektu, Chiefa of Staff, Autopilota ani GBots z Ghostex (`01` sekcja 5: „drugi produkt”).
- Heurystyk na prozie: wykrywania dryfu, `user_handoff`, „says it carries on” (`01` sekcja 5, p. 2).
- Przenoszenia kart zgód do czatu koordynatora. Wystarczy link do wątku z kartą; relay to duża zmiana w sidebarze, który Mike przebudowuje (L7).
- Grafu wykonania i kohort dostarczeń z T3 (`Orchestrator.ts` ma 16 tys. linii, a release notes to głównie poprawki wyścigów, `02b` sekcja 4).
- Odcinania Michała od dzieci. Dzieci to pełne wątki, do których może napisać (`02b` sekcja 4).
- Tagów Q<n> i markerów emoji w raportach. Karty asks Threadbear robią to samo strukturalnie.

## 7. Kolejność i czas

1. Etap 0.1 i 0.2: jedna sesja (playbook v2 i schemat raportu).
2. Etap 0.3: przypadki eval, potem przebiegi. Około 20 krótkich sesji na tanim modelu, rozłożonych na 1-2 dni.
3. Etap 1.2 (strażnik), potem 1.1 (panel). Strażnik najpierw, bo zamyka największą lukę funkcjonalną.
4. Etap 2: issue 1-2 z danymi z evalu, równolegle z Etapem 1.
5. Etap 3: dopiero po odpowiedzi Mike'a i drugim przebiegu evalu.

## 8. Ryzyka

- **Upstream zmienia model koordynatorów.** Zapowiedziany eksperyment Mike'a może zastąpić część planu. Ograniczenie: Etap 0 i 1 to prompt, patch i harmonogram, które łatwo wyrzucić. Przy każdym scalaniu wydania czytać `runner/src/experiments/`.
- **Najbliższe scalenie wydania wyłączy `quietInbox` (hibernację startera) i `sameWork`.** Playbook v2 nie może na nich polegać (`03` sekcja 4, ostatni akapit).
- **`tb list --all --json` co 20 s na każdy wątek z panelem.** Kosztu nie mierzono (`03` sekcja 5). Mierzymy w 1.1, a w razie potrzeby cache w pliku.
- **Pobudka harmonogramu w trakcie hibernacji `waitFor` czyści `waitingOn`.** Niesprawdzone (`03` sekcja 5). Playbook v2 każe po każdej pobudce ponownie założyć `waitFor`.
- **Codex jako koordynator.** Niesprawdzony (`stuck-jobs` działa tylko dla Claude). Eval robimy na Claude; Codex dopiero po Etapie 1.
