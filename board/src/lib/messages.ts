// Treść wiadomości, które użytkownik podpisuje portfelem. Używa ich przeglądarka (do podpisu)
// i serwer (do sprawdzenia podpisu) — dlatego jedna wspólna funkcja dla obu stron.
// `timestamp` (ms) sprawia, że podpisu nie da się użyć ponownie po kilku minutach.

import type { Contact } from "./contact";

export type NewOffer = { title: string; description: string; budget: string } & Contact;

export const addOfferMessage = (offer: NewOffer, timestamp: number) =>
  `LinkDeal — dodaj ogłoszenie\nTytuł: ${offer.title}\nBudżet: ${offer.budget} SOL\nOpis: ${offer.description}\n` +
  `Kontakt: e-mail ${offer.email || "—"}, Telegram ${offer.telegram || "—"}, Discord ${offer.discord || "—"}\nCzas: ${timestamp}`;

export const closeOfferMessage = (id: number, timestamp: number) =>
  `LinkDeal — zamknij ogłoszenie #${id}\nCzas: ${timestamp}`;
