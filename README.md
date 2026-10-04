# LinkDeal

Escrow dla freelancerów na Solanie. Pieniądze za zlecenie są zamrożone w programie on-chain i trafiają do wykonawcy po zaliczeniu kolejnych milestone'ów. Bez pośrednika, backendu i bazy danych.

Hackathon Superteam Poland, challenge „Finance Without Intermediaries”.

- **Aplikacja:** [linkdeal.fun](https://linkdeal.fun) · **Ogłoszenia:** [ogloszenia.linkdeal.fun](https://ogloszenia.linkdeal.fun)
- **Program (devnet):** [`AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S`](https://explorer.solana.com/address/AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S?cluster=devnet)

## Jak to działa

1. Strony dogadują się poza aplikacją: na Discordzie, OLX albo przez [ogłoszenia](https://ogloszenia.linkdeal.fun).
2. **Wykonawca** tworzy ofertę: milestone'y (opis i kwota każdego), deadline i ważność oferty. Kwota zlecenia to suma milestone'ów. Podpisuje ofertę portfelem i wysyła link zleceniodawcy.
3. **Zleceniodawca** otwiera link, widzi warunki odczytane z blockchaina i przyjmuje ofertę. Cała kwota zostaje zamrożona na koncie umowy.
4. Zleceniodawca zalicza milestone'y po kolei. Za każdy program od razu wypłaca wykonawcy jego kwotę.
5. Po ostatnim milestonie umowa się zamyka. Jeśli do deadline'u nie wszystko zostało zaliczone, niewypłacona kwota wraca do zleceniodawcy.

## Dlaczego nie ma sporów

Przykład: zlecenie na 3 SOL, 3 milestone'y po 1 SOL, deadline za miesiąc. Zleceniodawca zalicza milestone 1, więc wykonawca dostaje 1 SOL. Współpraca się urywa, a po deadlinie pozostałe 2 SOL wracają do zleceniodawcy.

- Pieniądze leżą na koncie umowy, a nie u którejś ze stron. Nikt nie wypłaci ich sam dla siebie.
- Każdy milestone ma tylko dwa wyniki: zaliczony oznacza wypłatę dla wykonawcy, niezaliczony do deadline'u oznacza zwrot do zleceniodawcy. Nie ma czego rozstrzygać, więc nie trzeba arbitra.
- Wykonawca ryzykuje najwyżej jeden milestone. Jeśli praca nie zostanie zaliczona, nie robi kolejnych.
- Deadline gwarantuje koniec umowy. Pieniądze nie utkną na zawsze.

## Kto co może

| Instrukcja | Kto | Kiedy | Efekt |
|---|---|---|---|
| `create_escrow` | wykonawca | 1–10 milestone'ów z opisem i kwotą > 0; oferta wygasa nie później niż deadline | powstaje oferta; wykonawca płaci kaucję ~0,0065 SOL za konto |
| `fund` | każdy, ale tylko raz | przed wygaśnięciem oferty | przyjmujący zostaje zleceniodawcą; kwota zostaje zamrożona |
| `approve_milestone` | tylko zleceniodawca | przed deadlinem, po kolei | wykonawca dostaje kwotę milestone'u; po ostatnim konto się zamyka |
| `cancel` | każdy | oferta wygasła i nie została przyjęta | konto się zamyka, kaucja wraca do wykonawcy |
| `refund_after_deadline` | każdy | po deadlinie | niewypłacona kwota wraca do zleceniodawcy, kaucja do wykonawcy |

Na Solanie nic nie dzieje się samo, więc anulowanie i zwrot uruchamia przycisk. Kliknąć może każdy, ale pieniądze zawsze trafiają tylko do stron umowy.

Przyjętej umowy nie da się anulować w trakcie. Gdyby mogła to zrobić jedna strona, zleceniodawca mógłby zabrać pieniądze tuż przed zaliczeniem pracy.

## Backend służy tylko do ogłoszeń

Cała logika umowy działa w programie on-chain: kto przyjmuje ofertę, kto zalicza, ile wypłacić, deadline i zwrot.

- **linkdeal.fun** (aplikacja umów) to same statyczne pliki. Czyta umowy prosto z blockchaina, a transakcje podpisuje portfel użytkownika.
- **ogloszenia.linkdeal.fun** to osobna aplikacja z bazą Postgres. Nie trzyma pieniędzy, nie tworzy umów i nie podpisuje transakcji.
- Nawet jeśli serwer przestanie działać, każdą umowę da się dokończyć bezpośrednio przez program, np. z CLI.

## Odpowiedzi na pytania jury

- **Gdzie znika pośrednik?** Pieniądze trzyma i wypłaca program on-chain według reguł zapisanych w kodzie.
- **Co, jeśli strona zniknie?** Gdy znika zleceniodawca, wykonawca zachowuje to, co już dostał, a reszta wraca do zleceniodawcy po deadlinie. Gdy znika wykonawca, zleceniodawca nie zalicza milestone'ów i po deadlinie odzyskuje resztę. Nieprzyjęta oferta wygasa i można ją anulować.
- **Czy autor może coś zmienić po deployu?** Po ostatecznym deployu nie. Odbieramy uprawnienie do aktualizacji programu (upgrade authority), więc kodu nie da się już zmienić.
- **Dlaczego blockchain, a nie baza?** W bazie pieniądze trzyma jej właściciel i trzeba mu ufać. Tutaj trzyma je program, którego reguł nikt nie zmieni, a każdą transakcję widać w Solana Explorer.

## Pomysły na później

- **Zakończenie umowy za zgodą obu stron:** wcześniejsze rozliczenie, gdy wykonawca i zleceniodawca podpiszą je razem. To nowy mechanizm w programie, celowo pominięty na hackathon.
- **Czat w ogłoszeniach** z logowaniem portfelem, najlepiej na gotowym rozwiązaniu (kandydaci: TalkJS, Solchat; XMTP po dodaniu obsługi Solany).

## Co gdzie jest

```
programs/linkdeal/src/lib.rs   program: instrukcje, konto umowy, błędy, unit testy
tests/linkdeal.ts              testy integracyjne na lokalnym blockchainie (Surfpool)
app/                           aplikacja umów (Astro + daisyUI, statyczna) → linkdeal.fun
board/                         ogłoszenia (Astro + API + Postgres) → ogloszenia.linkdeal.fun
deploy/                        serwer: docker-compose.yml + Caddyfile
Dockerfile, .devcontainer/     środowisko: Anchor 1.1.2, Rust 1.95, Node 24, Surfpool
```

## Uruchomienie lokalne

Wymagany jest tylko Docker.

```bash
docker build --platform linux/amd64 --target toolchain -t linkdeal-dev .
docker run -d --name linkdeal --platform linux/amd64 \
  -v "$PWD":/workspaces/LinkDeal -w /workspaces/LinkDeal \
  -v linkdeal-solana:/root/.config/solana \
  -p 8899:8899 -p 4321:4321 -p 4322:4322 \
  linkdeal-dev sleep infinity

docker exec linkdeal npm install
docker exec linkdeal cargo test -p linkdeal   # unit testy
docker exec linkdeal anchor test              # testy integracyjne

# aplikacja umów → http://localhost:4321
docker exec -it linkdeal bash -lc 'cd app && npm install && npm run dev'

# ogłoszenia (Postgres w sieci Dockera) → http://localhost:4322
docker network create linkdeal-net
docker run -d --name linkdeal-db --network linkdeal-net \
  -e POSTGRES_USER=linkdeal -e POSTGRES_PASSWORD=linkdeal -e POSTGRES_DB=linkdeal \
  -v linkdeal-db:/var/lib/postgresql/data postgres:17
docker network connect linkdeal-net linkdeal
docker exec -it linkdeal bash -lc 'cd board && npm install && npm run dev'

# deploy programu na devnet (RPC w .env, wzór w .env.example)
docker exec linkdeal bash -lc 'source .env && anchor deploy --provider.cluster "$RPC_URL"'
```

Jeśli zmiana w kodzie „nie działa”, zrestartuj kontener (`docker restart linkdeal`). Docker Desktop potrafi czasem pokazywać kontenerowi starą wersję pliku.

## Deploy na serwer

Jeden serwer z Dockerem. Rekordy DNS typu A dla `linkdeal.fun`, `www` i `ogloszenia` wskazują na jego IP, a certyfikaty HTTPS Caddy pobiera sam.

```bash
curl -fsSL https://get.docker.com | sh            # Docker (raz)
git clone https://github.com/machayka/LinkDeal.git
cd LinkDeal/deploy
cp .env.example .env && nano .env                 # hasło do bazy + RPC Heliusa
docker compose up -d --build

# aktualizacja
git pull && docker compose up -d --build
```

## Status

- [x] Program na devnecie: 5 instrukcji, unit testy i testy integracyjne
- [x] Aplikacja umów i ogłoszenia na serwerze
- [ ] Czat w ogłoszeniach
- [ ] Ostateczny deploy z odebranym upgrade authority
