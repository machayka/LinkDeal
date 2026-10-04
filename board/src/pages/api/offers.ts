import type { APIRoute } from "astro";
import { isValidSignature } from "../../lib/auth";
import { sql, type Offer } from "../../lib/db";
import { contactError, normalizeContact } from "../../lib/contact";
import { addOfferMessage } from "../../lib/messages";

// GET /api/offers?wallet=<adres> — ogłoszenia danego portfela (dla „Moje ogłoszenia”). Bez kontaktów.
export const GET: APIRoute = async ({ url }) => {
  const wallet = url.searchParams.get("wallet") ?? "";
  const offers = await sql<Offer[]>`
    SELECT id, title, budget_sol, status, created_at FROM offers WHERE client_wallet = ${wallet} ORDER BY created_at DESC`;
  return Response.json(offers);
};

// POST /api/offers — dodanie ogłoszenia. Autorem jest ten, kto podpisał wiadomość portfelem.

export const POST: APIRoute = async ({ request }) => {
  const { title, description, budget, address, timestamp, signature, ...rest } = await request.json();
  const contact = normalizeContact({ email: String(rest.email ?? ""), telegram: String(rest.telegram ?? ""), discord: String(rest.discord ?? "") });
  const problem = contactError(contact);
  if (problem) return new Response(problem, { status: 400 });

  const message = addOfferMessage({ title, description, budget, ...contact }, timestamp);
  if (!isValidSignature(message, signature, address, timestamp))
    return new Response("Nieprawidłowy albo przeterminowany podpis portfela.", { status: 401 });

  // Reguły (długość tytułu, budżet > 0) pilnuje baza — zob. db/schema.sql.
  try {
    const [offer] = await sql`
      INSERT INTO offers (client_wallet, title, description, budget_sol, contact_email, contact_telegram, contact_discord)
      VALUES (${address}, ${title}, ${description}, ${budget},
              ${contact.email || null}, ${contact.telegram || null}, ${contact.discord || null})
      RETURNING id`;
    return Response.json({ id: offer.id });
  } catch {
    return new Response("Nieprawidłowe dane ogłoszenia.", { status: 400 });
  }
};
