// Kontakt do autora ogłoszenia: e-mail, Telegram, Discord. Wspólne dla formularza i serwera.

export type Contact = { email: string; telegram: string; discord: string };

// Ujednolica to, co wpisał użytkownik: „@nick”, „t.me/nick” i „https://t.me/nick” → „nick”.
export const normalizeContact = (c: Contact): Contact => ({
  email: c.email.trim().toLowerCase(),
  telegram: c.telegram.trim().replace(/^(https?:\/\/)?t\.me\//i, "").replace(/^@/, ""),
  discord: c.discord.trim().replace(/^@/, "").toLowerCase(),
});

// Komunikat błędu albo null, gdy kontakt jest poprawny.
export function contactError(c: Contact): string | null {
  if (!c.email && !c.telegram && !c.discord) return "Podaj co najmniej jeden sposób kontaktu.";
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return "Nieprawidłowy adres e-mail.";
  if (c.telegram && !/^[A-Za-z0-9_]{5,32}$/.test(c.telegram))
    return "Nick na Telegramie: 5–32 znaki (litery, cyfry, podkreślnik).";
  if (c.discord && !/^[a-z0-9_.]{2,32}$/.test(c.discord))
    return "Nazwa na Discordzie: 2–32 znaki (małe litery, cyfry, podkreślnik, kropka).";
  return null;
}
