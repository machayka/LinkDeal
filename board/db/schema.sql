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

-- Kontakt do autora ogłoszenia (co najmniej jeden — pilnuje API). ADD COLUMN IF NOT EXISTS: działa też na istniejącej bazie.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS contact_email    text CHECK (length(contact_email) <= 254);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS contact_telegram text CHECK (contact_telegram ~ '^[A-Za-z0-9_]{5,32}$');
ALTER TABLE offers ADD COLUMN IF NOT EXISTS contact_discord  text CHECK (contact_discord ~ '^[a-z0-9_.]{2,32}$');
