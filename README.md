# LinkDeal

Escrow dla freelancerów na Solanie. Warunki zlecenia, czyli kwotę, milestone'y i deadline, pilnuje program on-chain. Umowy działają bez pośrednika, backendu i bazy danych.

Hackathon Superteam Poland, challenge „Finance Without Intermediaries”.

**Program (devnet):** [`AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S`](https://explorer.solana.com/address/AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S?cluster=devnet)

## Jak to działa

1. Strony ustalają warunki poza aplikacją (Discord, OLX, Pracuj.pl).
2. **Wykonawca** tworzy umowę: kwotę, deadline, ważność oferty i listę milestone'ów. Każdy milestone ma opis i % całej kwoty. Podpisuje ją portfelem i dostaje link do umowy.
3. **Zleceniodawca** otwiera link, widzi warunki odczytane z blockchaina i klika „Przyjmij ofertę”. Wtedy 100% kwoty trafia na konto umowy.
4. Wykonawca oddaje kolejne milestone'y poza aplikacją.
5. Zleceniodawca klika „Zalicz milestone” i program od razu wypłaca wykonawcy % tego milestone'u.
6. Po ostatnim milestonie wykonawca dostaje resztę, a konto umowy się zamyka.

## Dlaczego nie ma sporów

Przykład: zlecenie 3k, 3 milestone'y po 1k, deadline 1 miesiąc. Milestone 1 zostaje zaliczony, więc 1k idzie do wykonawcy. Po deadlinie pozostałe 2k wraca do zleceniodawcy.

- Pieniądze leżą na koncie umowy, a nie u którejś ze stron. Nikt nie wypłaci ich sam dla siebie.
- Każdy milestone ma tylko dwa możliwe wyniki. Zaliczony oznacza wypłatę dla wykonawcy. Niezaliczony do deadline'u oznacza zwrot do zleceniodawcy. Nie ma czego rozstrzygać, więc nie trzeba arbitra.
- Ryzyko jest ograniczone do jednego milestone'u. Jeśli milestone 1 nie zostanie zaliczony, wykonawca nie robi kolejnych.
- Deadline gwarantuje koniec umowy. Pieniądze nie mogą utknąć na zawsze.

## Kto co może

| Akcja | Kto | Kiedy |
|---|---|---|
| `create_escrow` — utwórz umowę | wykonawca | 1–10 milestone'ów, każdy ≥5%, suma 100%, oferta wygasa w przyszłości i nie później niż deadline |
| `fund` — przyjmij ofertę | każdy, kto wpłaci; staje się zleceniodawcą | przed wygaśnięciem oferty, tylko raz |
| `approve_milestone` — zalicz milestone | tylko zleceniodawca | przed deadlinem, milestone'y po kolei |
| `cancel` — anuluj ofertę | każdy | nikt nie wpłacił, a oferta wygasła; rent wraca do wykonawcy |
| `refund_after_deadline` — zwróć resztę | każdy | po deadlinie; reszta do zleceniodawcy, rent do wykonawcy |

Na Solanie nic nie dzieje się samo. Anulowanie i zwrot uruchamia się przyciskiem, który może kliknąć każdy, ale pieniądze trafiają zawsze tylko do stron umowy.

## Backend służy tylko do ogłoszeń

Cała logika umowy działa w programie on-chain: kto wpłaca, kto zalicza, ile wypłacić, deadline i zwrot. Backend obsługuje wyłącznie ogłoszenia, które nie mają związku z blockchainem.

- **linkdeal.fun** to aplikacja umów: same statyczne pliki, bez serwera aplikacji i bez bazy.
- **ogloszenia.linkdeal.fun** to ogłoszenia: osobna aplikacja z własną bazą Postgres.

- Backend nie trzyma pieniędzy, nie tworzy umów i nie podpisuje transakcji.
- Frontend czyta umowę prosto z blockchaina, a transakcje podpisuje portfel użytkownika.
- Nawet jeśli serwer przestanie działać, każdą umowę da się dokończyć bezpośrednio przez program, np. z innego frontu albo z CLI.

## Odpowiedzi na pytania jury

- **Gdzie znika pośrednik?** Rolę pośrednika pełni program on-chain. Trzyma pieniądze i wypłaca je według reguł zapisanych w kodzie.
- **Co, jeśli strona zniknie?** Jeśli zleceniodawca zniknie, po deadlinie reszta wraca do niego, a wykonawca zachowuje to, co już dostał. Jeśli wykonawca zniknie, zleceniodawca nie zalicza milestone'ów i po deadlinie odzyskuje resztę. Jeśli nikt nie wpłaci, oferta wygasa i można ją anulować.
- **Czy autor może coś zmienić po deployu?** Nie. Ostateczny deploy odbiera uprawnienie do aktualizacji programu (upgrade authority), więc kodu nie da się już zmienić.
- **Dlaczego blockchain, a nie baza?** Przy bazie danych pieniądze trzyma jej właściciel i trzeba mu ufać. Tutaj trzyma je program, którego reguł nikt nie może zmienić, a każdą transakcję widać w Solana Explorer.

## Co gdzie jest

```
programs/linkdeal/src/lib.rs   cały program: instrukcje, konto umowy, błędy, unit testy
tests/linkdeal.ts              testy integracyjne na lokalnym blockchainie
app/                           aplikacja umów (Astro + daisyUI, statyczna, bez backendu) → linkdeal.fun
board/                         ogłoszenia (Astro + API + Postgres) → ogloszenia.linkdeal.fun
deploy/                        serwer: docker-compose.yml + Caddyfile
Dockerfile, .devcontainer/     środowisko: Anchor 1.1.2, Rust 1.95, Node 24, Surfpool
```

## Uruchomienie

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
docker exec linkdeal anchor test              # testy integracyjne (Surfpool)

# aplikacja umów → http://localhost:4321
docker exec -it linkdeal bash -lc 'cd app && npm install && npm run dev'

# ogłoszenia: Postgres w sieci Dockera + aplikacja → http://localhost:4322
docker network create linkdeal-net
docker run -d --name linkdeal-db --network linkdeal-net \
  -e POSTGRES_USER=linkdeal -e POSTGRES_PASSWORD=linkdeal -e POSTGRES_DB=linkdeal \
  -v linkdeal-db:/var/lib/postgresql/data postgres:17
docker network connect linkdeal-net linkdeal
docker exec -it linkdeal bash -lc 'cd board && npm install && npm run dev'

# deploy na devnet (RPC w .env, wzór w .env.example)
docker exec linkdeal bash -lc 'source .env && anchor deploy --provider.cluster "$RPC_URL"'
```

## Deploy (serwer)

Jeden serwer z Dockerem. Caddy serwuje aplikację umów jako statyczne pliki i przekazuje `ogloszenia.linkdeal.fun` do aplikacji ogłoszeń z bazą Postgres (`deploy/docker-compose.yml`). DNS: rekordy A dla `linkdeal.fun`, `www` i `ogloszenia` wskazują na IP serwera.

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

- [x] Program: wszystkie 5 instrukcji, unit testy i testy integracyjne
- [x] Deploy na devnet
- [x] Aplikacja umów (linkdeal.fun)
- [x] Serwer: Docker + Caddy (pliki w deploy/)
- [x] Ogłoszenia (ogloszenia.linkdeal.fun) — czat TODO
- [ ] Ostateczny deploy z odebranym upgrade authority
