# ogloszenia.linkdeal.fun: wizja

Tablica ogłoszeń od zleceniodawców. Wykonawca znajduje tu zlecenie, a warunki ustala ze zleceniodawcą na czacie. Potem tworzy umowę na linkdeal.fun.

Zasada nadrzędna: **ogłoszenia nie dotykają pieniędzy ani umów.** Escrow działa wyłącznie on-chain, a tablica to zwykły serwis z bazą. Zero funkcji, które da się zastąpić gotowym narzędziem.

## Przepływ

1. **Zleceniodawca** dodaje ogłoszenie: tytuł, opis, budżet, termin i kontakt (Telegram albo Discord). Podpisuje się portfelem, bez zakładania konta.
2. **Wykonawca** przegląda listę, otwiera ogłoszenie i klika **„Napisz”**, co otwiera czat ze zleceniodawcą (TODO, patrz niżej).
3. Strony ustalają kwotę, taski i deadline na czacie.
4. Wykonawca klika **„Utwórz umowę”**. Otwiera się linkdeal.fun/new z wypełnionym budżetem i terminem, a dalej działa zwykły flow escrow.
5. Zleceniodawca zamyka ogłoszenie, gdy znalazł wykonawcę.

## Kontakt: czat — TODO

**Decyzja:** czat będzie, ale wyłącznie tutaj, na ogloszenia.linkdeal.fun. System scentralizowany (ogłoszenia i czat) jest oddzielony od zdecentralizowanego (escrow on-chain na linkdeal.fun).

Wymagania:
- Autoryzacja przez portfel (Phantom i inne przez Wallet Standard), czyli podpis wiadomości zamiast konta i hasła.
- Najlepiej gotowe rozwiązanie, a nie własny czat.

Do wyboru później. Kandydaci sprawdzeni w październiku 2026:

| Opcja | Uwagi |
|---|---|
| TalkJS (gotowy widget) | działa od razu, ma pliki. Darmowy tylko w trybie deweloperskim, a produkcja kosztuje od $279 miesięcznie. Tożsamość z portfela wymaga podpisu po stronie naszego backendu |
| Solchat (Web3) | SDK dla portfeli Solany. Młody projekt z własnym tokenem, wiadomości on-chain |
| XMTP | nie obsługuje jeszcze portfeli Solany |
| Dialect | nie oferuje już czatu, tylko Blinks, Alerts i Markets |

## Logowanie: tylko podpis portfelem

- Bez haseł i kont. Przy dodawaniu i zamykaniu ogłoszenia użytkownik podpisuje wiadomość portfelem (`signMessage` przez Wallet Standard), a serwer sprawdza podpis.
- Ogłoszenie jest przypisane do adresu portfela autora, więc tylko on może je zamknąć.
- Przeglądanie jest publiczne i nie wymaga portfela.

## Ogłoszenie: dane (Postgres)

| Pole | Opis |
|---|---|
| `id` | identyfikator |
| `client_wallet` | adres portfela autora |
| `title` | tytuł, krótki |
| `description` | opis zlecenia |
| `budget_sol` | budżet orientacyjny w SOL |
| `due_date` | oczekiwany termin |
| `status` | `open` / `closed` |
| `created_at` | data dodania |

Na start bez kategorii, tagów, zdjęć, ocen i ulubionych.

## Ekrany

1. **Lista** (`/`): karty ogłoszeń z tytułem, budżetem, terminem i datą, najnowsze na górze.
2. **Ogłoszenie** (`/o/<id>`): opis i dwa przyciski, „Napisz” (czat) i „Utwórz umowę”, który prowadzi do linkdeal.fun/new z danymi.
3. **Dodaj ogłoszenie** (`/new`): formularz zatwierdzany podpisem portfela.
4. **Moje ogłoszenia** (`/my`): lista ogłoszeń podłączonego portfela z przyciskiem „Zamknij”.

## Technika

- Astro z adapterem Node: strony i API w jednym projekcie (`board/`), z tym samym motywem daisyUI co aplikacja umów.
- Postgres w osobnym kontenerze, a w kodzie zwykłe zapytania SQL bez ORM.
- Weryfikacja podpisu portfela po stronie serwera (ed25519).
- Docker Compose na Hetznerze, a Caddy kieruje `ogloszenia.linkdeal.fun` do kontenera `board`.

## Do decyzji zespołu

- [ ] Czat: które gotowe rozwiązanie z autoryzacją portfelem?
- [ ] Czy ogłoszenia mają wygasać same, np. po 30 dniach?
- [ ] Czy „Utwórz umowę” ma przenosić tytuł ogłoszenia jako opis pierwszego taska?
- [ ] Ochrona przed spamem: wystarczy podpis portfelem i limit ogłoszeń na portfel?
- [ ] Czy pokazujemy tablicę na demo hackathonowym, czy tylko wspominamy o niej jako o planie?
