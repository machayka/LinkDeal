# ogloszenia.linkdeal.fun: wizja

Tablica ogłoszeń od zleceniodawców. Wykonawca znajduje tu zlecenie, a warunki ustala ze zleceniodawcą na Telegramie albo Discordzie. Potem tworzy umowę na linkdeal.fun.

Zasada nadrzędna: **ogłoszenia nie dotykają pieniędzy ani umów.** Escrow działa wyłącznie on-chain, a tablica to zwykły serwis z bazą. Zero funkcji, które da się zastąpić gotowym narzędziem.

## Przepływ

1. **Zleceniodawca** dodaje ogłoszenie: tytuł, opis, budżet, termin i kontakt (Telegram albo Discord). Podpisuje się portfelem, bez zakładania konta.
2. **Wykonawca** przegląda listę, otwiera ogłoszenie i klika **„Napisz”**. Otwiera się komunikator wybrany przez zleceniodawcę.
3. Strony ustalają kwotę, taski i deadline w tym komunikatorze. Tam też wykonawca oddaje pracę, z plikami.
4. Wykonawca klika **„Utwórz umowę”**. Otwiera się linkdeal.fun/new z wypełnionym budżetem i terminem, a dalej działa zwykły flow escrow.
5. Zleceniodawca zamyka ogłoszenie, gdy znalazł wykonawcę.

## Kontakt: przycisk „Napisz” zamiast własnego czatu

Zleceniodawca wybiera komunikator i podaje swój nick. „Napisz” prowadzi tam bezpośrednio.

| Wybór | Co podaje zleceniodawca | Co robi „Napisz” |
|---|---|---|
| **Telegram** | nick, np. `jan_kowalski` | otwiera `https://t.me/jan_kowalski`, czyli od razu rozmowę |
| **Discord** | nazwę użytkownika, np. `jan.kowalski` | kopiuje nick do schowka i otwiera Discorda. Discord nie ma linku do rozmowy po samym nicku, więc trzeba go wkleić w wyszukiwarkę znajomych |

### Dlaczego nie czat w aplikacji

Stan sprawdzony w październiku 2026:

| Opcja | Dlaczego nie |
|---|---|
| Dialect | nie oferuje już czatu, tylko Blinks, Alerts i Markets |
| XMTP | nie obsługuje jeszcze portfeli Solany |
| Solchat (Web3, on-chain) | młody projekt z własnym tokenem. Wiadomości są on-chain, więc płatne i publiczne. UI trzeba zbudować samemu |
| TalkJS (gotowy widget) | darmowy tylko w trybie deweloperskim, a produkcja kosztuje od $279 miesięcznie. Do tożsamości przez portfel potrzebny jest backend. Rozmowy leżą u dostawcy |
| Własny czat | dużo pracy: wiadomości, powiadomienia, moderacja, spam |

Telegram i Discord ludzie już mają i oba obsługują pliki. Nie przechowujemy cudzych rozmów, więc nie stajemy się pośrednikiem. Do czatu w aplikacji, najpewniej TalkJS, można wrócić po hackathonie.

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
| `contact_type` | `telegram` / `discord` |
| `contact_handle` | nick w wybranym komunikatorze |
| `status` | `open` / `closed` |
| `created_at` | data dodania |

Na start bez kategorii, tagów, zdjęć, ocen i ulubionych.

## Ekrany

1. **Lista** (`/`): karty ogłoszeń z tytułem, budżetem, terminem i datą, najnowsze na górze.
2. **Ogłoszenie** (`/o/<id>`): opis i dwa przyciski, „Napisz” i „Utwórz umowę”, który prowadzi do linkdeal.fun/new z danymi.
3. **Dodaj ogłoszenie** (`/new`): formularz zatwierdzany podpisem portfela, z wyborem Telegram albo Discord i polem na nick.
4. **Moje ogłoszenia** (`/my`): lista ogłoszeń podłączonego portfela z przyciskiem „Zamknij”.

## Technika

- Astro z adapterem Node: strony i API w jednym projekcie (`board/`), z tym samym motywem daisyUI co aplikacja umów.
- Postgres w osobnym kontenerze, a w kodzie zwykłe zapytania SQL bez ORM.
- Weryfikacja podpisu portfela po stronie serwera (ed25519).
- Docker Compose na Hetznerze, a Caddy kieruje `ogloszenia.linkdeal.fun` do kontenera `board`.

## Do decyzji zespołu

- [ ] Czy ogłoszenia mają wygasać same, np. po 30 dniach?
- [ ] Czy „Utwórz umowę” ma przenosić tytuł ogłoszenia jako opis pierwszego taska?
- [ ] Ochrona przed spamem: wystarczy podpis portfelem i limit ogłoszeń na portfel?
- [ ] Czy pokazujemy tablicę na demo hackathonowym, czy tylko wspominamy o niej jako o planie?
