// POST /api/offers — dodanie ogłoszenia. Autorem jest ten, kto podpisał wiadomość portfelem.
import type { APIRoute } from "astro";
import { isValidSignature } from "../../lib/auth";
import { sql } from "../../lib/db";
import { addOfferMessage } from "../../lib/messages";

export const POST: APIRoute = async ({ request }) => {
  const { title, description, budget, address, timestamp, signature } = await request.json();

  const message = addOfferMessage({ title, description, budget }, timestamp);
  if (!isValidSignature(message, signature, address, timestamp))
    return new Response("Nieprawidłowy albo przeterminowany podpis portfela.", { status: 401 });

  // Reguły (długość tytułu, budżet > 0) pilnuje baza — zob. db/schema.sql.
  try {
    const [offer] = await sql`
      INSERT INTO offers (client_wallet, title, description, budget_sol)
      VALUES (${address}, ${title}, ${description}, ${budget})
      RETURNING id`;
    return Response.json({ id: offer.id });
  } catch {
    return new Response("Nieprawidłowe dane ogłoszenia.", { status: 400 });
  }
};
