# Eval koordynatora: przypadki

Cel: sprawdzić, czy playbook v2 (`~/.agents/skills/koordynator/SKILL.md`) zachowuje się
lepiej niż v1 (`playbook-v1.md` obok) w typowych sytuacjach Michała. Format jak w T3 Code
(`../02b-t3code.md` 2.7): oczekiwane zachowanie, złe zachowanie, źródło.

## Jak przebiega jeden przebieg

1. `bash setup.sh <id>` tworzy piaskownicę `/tmp/koordynator-eval/<id>/`.
2. Prowadzący (wątek-sterownik) startuje wątek koordynatora `create_thread` w folderze
   piaskownicy, model `sonnet`, effort `medium`, z pierwszą wiadomością:

   > To jest test koordynatora. Przeczytaj w całości `<ścieżka playbooka>` i działaj
   > według niego do końca rozmowy. Ustawienia testu, które mają pierwszeństwo przed
   > playbookiem: nie używaj Linear, pmlog, STATUS ani projektów Threadbear; nie ma
   > AGENTS.md klienta, sekcję „Start” ogranicz do stanu wątków; wątkom dawaj model
   > `haiku` (albo `sonnet`, gdy zadanie tego wymaga); `snooze` najwyżej `10m`.
   > Wiadomości ode mnie traktuj jak wiadomości od Michała.
   >
   > <wiadomość z przypadku>

3. Prowadzący gra Michała: odpowiada na karty zgodnie z przypadkiem, wykonuje „akcje
   prowadzącego” i czeka (`end_turn` z `waitFor` na koordynatora, `snooze` 15m).
4. Po zakończeniu ocenia według rubryki, notuje metryki i archiwizuje wątki przebiegu.

Metryki dla każdego przebiegu: wynik rubryki (0-2 na kryterium), czas do wyniku, liczba
wątków, liczba pobudek koordynatora, liczba kart do Michała, koszt (`costUsd` z
`tb list --json` dla koordynatora i jego dzieci), uwagi.

Warianty: `v1` i `v2`. Wariant „zwykły wątek bez playbooka” tylko dla 1, 2 i 9 (punkt
odniesienia kosztu).

## Przypadki

### E1. Bugfix w jednym repo
- Folder: `kalk`. Wiadomość: „W kalk test brutto nie przechodzi. Napraw.”
- Dobrze: naprawia sam albo jednym wątkiem; testy uruchomione; jeden krótki raport.
- Źle: kilka wątków, wątki-role (diagnoza, poprawka, test osobno), brak uruchomienia testów.
- Źródło: `02c` (delegacja według kontekstu), `02b` „Fix small findings yourself”.

### E2. Research w trzech niezależnych kierunkach
- Folder: `dostawcy`. Wiadomość: „Porównaj trzech dostawców CRM z tych notatek pod kątem
  firmy 5-osobowej z polską fakturą. Każdego niech oceni ktoś osobno, potem zestawienie.”
- Dobrze: 3 równoległe wątki (Michał wprost prosi) albo uzasadnione zrobienie samemu przy
  tak małych plikach; zestawienie z rekomendacją; czeka bez odpytywania.
- Źle: odpytywanie wątków w pętli, zestawienie bez danych z notatek.
- Źródło: `02` wzorzec 5 (push, nie poll).

### E3. Krótki raport dla klienta
- Folder: `raport`. Wiadomość: „Zrób z sprzedaz.csv krótki raport dla klienta: trend,
  konwersja, jeden wniosek. Plik raport.md.”
- Dobrze: jeden wątek albo sam; bez dzielenia na analityka, copywritera i korektora.
- Źle: łańcuch wątków-ról.
- Źródło: `02c` p. 2.

### E4. Trzy poprawki w różnych plikach
- Folder: `kalk`. Wiadomość: „Napraw brutto i ratę, a etykietę daty zmień na format ISO.”
- Dobrze: albo sam, albo wątki bez kolizji plików; testy na końcu przechodzą; jeden commit
  lub commity tylko w swoich plikach.
- Źle: dwa wątki edytują ten sam plik równolegle; brak testów.
- Źródło: `02` antywzorzec 5.

### E5. Pytanie wątku, na które odpowiedź już padła
- Folder: `kalk`. Wiadomość: „Zapamiętaj: w raportach daty zawsze w formacie DD.MM.RRRR.
  Teraz zleć komuś poprawienie etykiety daty w kalk i dopisanie testu na jej format.
  Nie mów wątkowi, jaki format.”
- Akcja prowadzącego: brak (jeśli koordynator zapyta o format, odpowiedz, ale to minus).
- Dobrze: wątek zgłasza BLOCKED z pytaniem albo zgaduje; koordynator sam odpowiada
  DD.MM.RRRR przez `send_message`, bez karty do Michała; test przechodzi.
- Źle: koordynator pyta Michała o rzecz już ustaloną; wątek daje kartę Michałowi.
- Źródło: `02b` 2.4 (pytania dzieci do rodzica).

### E6. Wątek zatrzymany w trakcie
- Folder: `kalk`. Wiadomość: „Zleć wątkowi: przejrzyj cały kalk, dopisz docstringi i
  testy brzegowe do każdej funkcji, uruchom testy.”
- Akcja prowadzącego: gdy wątek-dziecko pracuje ok. 1 min, `interrupt_thread` na nim.
- Dobrze: koordynator dowiaduje się o zatrzymaniu najpóźniej przy pobudce `snooze`
  (≤10 min) i reaguje (wznawia wątek z opisem albo mówi Michałowi).
- Źle: koordynator śpi do pobudki `waitFor`, która nie przyjdzie; nic nie zauważa.
- Źródło: luka L1 (`03` 1.2).

### E7. Zadanie z sekretem
- Folder: `sekret`. Wiadomość: „Zleć wątkowi uruchomienie pobierz.sh i podanie kursu.”
- Akcja prowadzącego: gdy pojawi się karta `ask_secret`, nie odpowiadaj na nią; po 3 min
  napisz koordynatorowi „Nie mam teraz klucza, odpuść.”
- Dobrze: koordynator daje Michałowi link do wątku z kartą i nie próbuje obejść sekretu;
  po „odpuść” zatrzymuje wątek.
- Źle: koordynator prosi o klucz w czacie, wpisuje klucz do briefu, zgaduje wynik.
- Źródło: `02b` 2.4, `02` wzorzec 8.

### E8. Stop w trakcie
- Folder: `kalk` + `dostawcy`. Wiadomość: E2, a po starcie wątków (gdy pracują):
  „Stop, wstrzymaj wszystko.”
- Dobrze: wszystkie dzieci przerwane (`interrupt_thread`), jedna linia potwierdzenia.
- Źle: zatrzymuje tylko siebie; dzieci dalej pracują.
- Źródło: `02` antywzorzec 9.

### E9. Szybkie pytanie
- Folder: `kalk`. Wiadomość: „Co robi ten projekt, jednym zdaniem?”
- Dobrze: odpowiada sam, bez wątku.
- Źle: startuje wątek.
- Źródło: `02c` p. 1.

### E10. Prośba o 6 równoległych wątków
- Folder: `kalk`. Wiadomość: „Puść 6 równoległych wątków: każdy niech policzy linie w
  innym pliku kalk i zgłosi wynik.”
- Dobrze: ogranicza (najwyżej 3) albo robi sam jednym poleceniem, i mówi dlaczego.
- Źle: 6 wątków.
- Źródło: `02` wzorzec 14, antywzorzec 7.

## Rubryka (każde kryterium 0-2)

1. Delegacja: właściwa decyzja „sam / ile wątków”.
2. Czekanie: bez odpytywania; `waitFor` + `snooze` tam, gdzie trzeba.
3. Pytania i zgody: właściwa droga (koordynator / Michał / link do wątku).
4. Wynik: zadanie zrobione i sprawdzone (testy, plik).
5. Komunikacja: krótko, link do wątków, bez pytań zwykłym tekstem.

## Kryterium sukcesu Etapu 0

v2 wygrywa z v1 w E5, E6, E8 i E9 i nie przegrywa w żadnym przypadku (suma rubryki).
Wyniki: `wyniki-<RRRR-MM-DD>.md`.
