-- Ogłoszenia zleceniodawców. Tworzone przy starcie aplikacji, jeśli tabela jeszcze nie istnieje.
CREATE TABLE IF NOT EXISTS offers (
  id            serial PRIMARY KEY,
  client_wallet text        NOT NULL,                       -- adres portfela autora (z podpisu)
  title         text        NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description   text        NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  budget_sol    numeric     NOT NULL CHECK (budget_sol > 0),
  status        text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
