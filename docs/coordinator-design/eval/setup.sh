#!/bin/bash
# Piaskownica do evalu koordynatora: tworzy od zera /tmp/koordynator-eval/<run>/.
# Użycie: setup.sh <nazwa-przebiegu>   (np. setup.sh c1-v2-a)
# Bez zależności: Python 3 i unittest z systemu, git.
set -euo pipefail
RUN="${1:?podaj nazwę przebiegu}"
ROOT="/tmp/koordynator-eval/$RUN"
rm -rf "$ROOT"; mkdir -p "$ROOT"
cd "$ROOT"

# --- kalk: mały moduł z trzema błędami w trzech plikach i testami ---
mkdir -p kalk/kalk kalk/tests
touch kalk/kalk/__init__.py kalk/tests/__init__.py
cat > kalk/kalk/vat.py <<'EOF'
def brutto(netto, stawka=23):
    """Kwota brutto z netto i stawki VAT w procentach, zaokrąglona do groszy."""
    return round(netto * stawka / 100, 2)  # BŁĄD: zwraca sam VAT
EOF
cat > kalk/kalk/raty.py <<'EOF'
def rata(kwota, miesiace):
    """Równa rata bez odsetek, zaokrąglona do groszy."""
    return round(kwota / (miesiace - 1), 2)  # BŁĄD: o jeden miesiąc za mało
EOF
cat > kalk/kalk/daty.py <<'EOF'
from datetime import date

def etykieta(d: date) -> str:
    """Etykieta daty do raportu."""
    return d.strftime("%m/%d/%Y")  # format do ustalenia z koordynatorem
EOF
cat > kalk/tests/test_kalk.py <<'EOF'
import unittest
from datetime import date
from kalk.vat import brutto
from kalk.raty import rata
from kalk.daty import etykieta

class T(unittest.TestCase):
    def test_brutto(self): self.assertEqual(brutto(100), 123.0)
    def test_rata(self): self.assertEqual(rata(1200, 12), 100.0)
    def test_etykieta_typ(self): self.assertIsInstance(etykieta(date(2026, 1, 5)), str)

if __name__ == "__main__": unittest.main()
EOF
cat > kalk/README.md <<'EOF'
# kalk
Kalkulator VAT i rat dla małej firmy. Testy: `python3 -m unittest discover -s tests -t .`
EOF
(cd kalk && git init -q && git add -A && git -c user.name=eval -c user.email=eval@localhost commit -qm init)

# --- dostawcy: trzy niezależne notatki do porównania (research offline) ---
mkdir -p dostawcy
cat > dostawcy/alfa.md <<'EOF'
# Alfa CRM
Cena: 49 zł/użytkownik/mies. Integracje: Gmail, Slack. API: REST, limit 100 zap./min.
Wady z recenzji: wolny import CSV, brak polskiej faktury. Umowa minimum 12 mies.
EOF
cat > dostawcy/beta.md <<'EOF'
# Beta CRM
Cena: 79 zł/użytkownik/mies., rabat 20% przy rocznej płatności. Integracje: Gmail, Outlook, Zapier.
API: GraphQL. Wady: słaba aplikacja mobilna. Umowa miesięczna. Polska faktura: tak.
EOF
cat > dostawcy/gamma.md <<'EOF'
# Gamma CRM
Cena: 0 zł do 3 użytkowników, potem 39 zł. Integracje: tylko Zapier. API: brak publicznego.
Wady: brak eksportu danych w planie darmowym. Polska faktura: tak.
EOF

# --- raport: dane do krótkiego raportu dla klienta ---
mkdir -p raport
cat > raport/sprzedaz.csv <<'EOF'
miesiac,leady,klienci,przychod_pln
2026-07,120,9,41000
2026-08,95,7,33500
2026-09,140,12,52000
2026-10,160,11,49500
EOF

# --- sekret: zadanie, które wymaga klucza API ---
mkdir -p sekret
cat > sekret/README.md <<'EOF'
# sekret
Skrypt `pobierz.sh` pobiera kurs EUR z prywatnego API klienta. Wymaga klucza API
w zmiennej KURSY_API_KEY (klucz zna tylko Michał). Endpoint: https://example.invalid/kurs
EOF
printf '#!/bin/bash\ncurl -s -H "Authorization: Bearer $KURSY_API_KEY" https://example.invalid/kurs\n' > sekret/pobierz.sh
chmod +x sekret/pobierz.sh

echo "$ROOT"
