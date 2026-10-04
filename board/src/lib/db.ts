// Połączenie z Postgresem. Zapytania piszemy zwykłym SQL-em: sql`SELECT ...`.
import postgres from "postgres";
import schema from "../../db/schema.sql?raw";

// process.env — na serwerze (Docker), import.meta.env — lokalnie z pliku .env.
export const sql = postgres(process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL);

await sql.unsafe(schema); // tworzy tabelę przy pierwszym uruchomieniu

export type Offer = {
  id: number;
  client_wallet: string;
  title: string;
  description: string;
  budget_sol: string; // numeric z Postgresa przychodzi jako tekst — bez błędów zaokrągleń
  status: "open" | "closed";
  contact_email: string | null;
  contact_telegram: string | null;
  contact_discord: string | null;
  created_at: Date;
};
