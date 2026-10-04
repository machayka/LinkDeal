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

CREATE TABLE IF NOT EXISTS chat_rooms (
  id          bigserial PRIMARY KEY,
  room_key    text NOT NULL UNIQUE,
  offer_id    integer REFERENCES offers(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  room_id    bigint NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  wallet     text NOT NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, wallet)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            bigserial PRIMARY KEY,
  room_id       bigint NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_wallet text NOT NULL,
  body          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_body_length CHECK (length(body) <= 10000)
);

CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx
  ON chat_messages(room_id, created_at, id);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id          bigserial PRIMARY KEY,
  message_id  bigint NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime_type   text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content     bytea NOT NULL
);
