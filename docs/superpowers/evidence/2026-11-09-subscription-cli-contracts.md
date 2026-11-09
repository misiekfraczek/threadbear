# Kontrakt CLI abonamentów - 09.11.2026

Próby wykonano lokalnie, w katalogach systemowego TMPDIR, bez kluczy API
w środowisku procesu. Nie odczytywano plików tokenów. Prywatne identyfikatory
sesji, kont i surowe odpowiedzi pozostają poza Git.

| Próba | Grok Build 1.0.77 | Antigravity ACP 1.5.3 |
| --- | --- | --- |
| Abonament potwierdzony metadanymi CLI | PASS: Oidc, SuperGrok Plus, backend_billed=false | PASS: Google AI Pro, g1-pro-tier |
| Krótka odpowiedź | PASS | PASS |
| Narzędzie MCP stdio | PASS: zwróciło Cobalt | PASS: zwróciło Cobalt |
| Nowy proces, session/load i pamięć wyniku | PASS | PASS |
| Odmowa polecenia zapisu | FAIL: brak pytania, plik utworzony | PASS: request_permission, plik nie powstał |
| session/cancel | PASS: stopReason=cancelled | PASS: stopReason=cancelled |
| Izolacja folderu | UNVERIFIED | UNVERIFIED |
| Prawdziwy limit abonamentu | UNVERIFIED, celowo niewyczerpywany | UNVERIFIED, celowo niewyczerpywany |

Grok jest dopuszczalny wyłącznie dla pełnych uprawnień. Dla trybów ask,
auto, plan oraz confined adapter musi odmówić. Google potwierdziło odmowę
w jednej sesji, ale lokalne reguły CLI mogą dopuszczać narzędzia bez pytania;
do czasu potwierdzenia nadpisania tych reguł obowiązuje ten sam warunek.
Brak izolacji oznacza odmowę uruchomienia wątku confined, także w trybie full.

## Transport

Oba programy udostępniają ACP 1: JSON-RPC po NDJSON na stdin/stdout.
Nieznane powiadomienie można pominąć; błędny JSON, zerwany transport albo
EOF przed odpowiedzią session/prompt nie oznaczają sukcesu.

- Grok: `grok agent --no-leader stdio`.
- Google: `agy --settings '{"useG1Credits":false,"modelProvider":"","gcp":{}}' acp`.
  Flaga settings przed acp została sprawdzona rzeczywistą odpowiedzią.
- initialize: protocolVersion=1, clientInfo.name=threadbear-probe.
  Nie podszywamy się pod zatwierdzony edytor.
- Grok authenticate: methodId=cached_token. Wynik zawiera auth_mode,
  subscription_tier, backend_billed i email. Brak tych danych nie daje ready.
- Google session/new: _meta.antigravity.tier zawiera id i name planu.
  Próba nie wymagała authenticate ani otwierania okna logowania.
- session/new i session/load: cwd oraz mcpServers; load zawiera sessionId.
- session/set_model: sessionId, modelId. Modele prób: grok-4.5 oraz
  gemini-3.8-flash-low. Google dopuszcza wyłącznie modele gemini-.
- session/prompt: sessionId, prompt=[{type:text,text:...}].
  Sukces: stopReason=end_turn. Przerwanie: cancelled.
- session/update: update.sessionUpdate, m.in. agent_message_chunk,
  agent_thought_chunk, tool_call, tool_call_update. Wznowienie odtwarza historię;
  nie wolno emitować jej ponownie do transkryptu Threadbear.
- session/request_permission: options z optionId i kind, np. allow_once,
  reject_once. Odpowiedź outcome={outcome:selected,optionId:...}.
- MCP stdio: {name,command,args,env:[]}. Przetestowany mały serwer Python
  udostępniał jedno nieszkodliwe narzędzie.

Wspólny transport ACP może obsługiwać obie integracje. Logowanie, modele,
konfiguracja i rozpoznanie limitów pozostają rozdzielone. Nie zmieniamy
adapterów Claude i Codex na nową abstrakcję.

## Źródła

- [Grok Build CLI](https://docs.x.ai/build/cli/reference)
- [Grok ACP - oficjalny kod dokumentacji](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md)
- [Antigravity ACP](https://antigravity.google/docs/ide/extensions/acp/)
- [Antigravity CLI i ustawienia](https://antigravity.google/docs/cli/reference/)

Dokumentacja Google opisuje useG1Credits jako użycie kredytów po wyczerpaniu
planu. Integracja wymusza false i usuwa źródła API ze środowiska. Nie używa
ścieżki konsumenckiej Gemini CLI. Metadane kosztu w odpowiedzi CLI nie są
same w sobie dowodem pobrania opłaty API.
