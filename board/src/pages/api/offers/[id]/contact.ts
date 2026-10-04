// GET /api/offers/<id>/contact — kontakt do autora. Strona pobiera go dopiero po połączeniu portfela,
// więc kontaktów nie ma w kodzie strony (proste boty zbierające adresy ich nie widzą).
import type { APIRoute } from "astro";
import { sql } from "../../../../lib/db";

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  const [offer] = Number.isInteger(id)
    ? await sql`SELECT contact_email, contact_telegram, contact_discord FROM offers WHERE id = ${id} AND status = 'open'`
    : [];
  if (!offer) return new Response(null, { status: 404 });
  return Response.json({ email: offer.contact_email, telegram: offer.contact_telegram, discord: offer.contact_discord });
};
