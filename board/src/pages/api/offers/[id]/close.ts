// POST /api/offers/<id>/close — zamknięcie ogłoszenia. Może tylko autor (podpis jego portfelem).
import type { APIRoute } from "astro";
import { isValidSignature } from "../../../../lib/auth";
import { sql } from "../../../../lib/db";
import { closeOfferMessage } from "../../../../lib/messages";

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  const { address, timestamp, signature } = await request.json();

  if (!Number.isInteger(id) || !isValidSignature(closeOfferMessage(id, timestamp), signature, address, timestamp))
    return new Response("Nieprawidłowy albo przeterminowany podpis portfela.", { status: 401 });

  // Warunek client_wallet = podpisujący: cudzego ogłoszenia nie zamkniesz.
  const closed = await sql`UPDATE offers SET status = 'closed' WHERE id = ${id} AND client_wallet = ${address} RETURNING id`;
  if (closed.length === 0) return new Response("To nie jest Twoje ogłoszenie.", { status: 403 });
  return new Response(null, { status: 204 });
};
