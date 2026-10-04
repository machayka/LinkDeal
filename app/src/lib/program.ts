// Anchor w przeglądarce potrzebuje Buffer (w Node jest wbudowany). Musi być przed importem Anchora.
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { AnchorProvider, BN, Program, web3 } from "@anchor-lang/core";
import idl from "../idl/linkdeal.json";
import type { Linkdeal } from "../idl/linkdeal";
import type { AnchorWallet } from "./wallet";

export const connection = new web3.Connection(import.meta.env.PUBLIC_RPC_URL, "confirmed");

// Bez podłączonego portfela tylko czytamy dane — podpisywanie rzuca błąd.
const readOnlyWallet: AnchorWallet = {
  publicKey: web3.PublicKey.default,
  signTransaction: () => Promise.reject(new Error("Connect a wallet first")),
  signAllTransactions: () => Promise.reject(new Error("Connect a wallet first")),
};

export function getProgram(wallet: AnchorWallet | null) {
  const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, { commitment: "confirmed" });
  return new Program<Linkdeal>(idl as Linkdeal, provider);
}

// Adres umowy = PDA z seedów ["escrow", wykonawca, nonce] — tak samo jak w programie.
export function escrowPda(freelancer: web3.PublicKey, nonce: BN) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), freelancer.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    new web3.PublicKey(idl.address),
  )[0];
}

// Dane umowy z blockchaina; null, gdy konto nie istnieje (np. umowa już zamknięta).
export const fetchEscrow = (address: web3.PublicKey) => getProgram(null).account.escrow.fetchNullable(address);
export type Escrow = NonNullable<Awaited<ReturnType<typeof fetchEscrow>>>;

// Aktywne umowy portfela: jako wykonawca (pole freelancer) albo zleceniodawca (pole client).
// Filtr porównuje bajty na stałej pozycji w koncie: 8 bajtów nagłówka Anchora, potem freelancer (32),
// potem client: 1 bajt „jest/nie ma” i adres. Zakończone umowy są zamknięte, więc ich tu nie ma.
const FREELANCER_OFFSET = 8;
const CLIENT_OFFSET = 8 + 32 + 1;
// Rozmiar konta w obecnym formacie (test `escrow_size` w programie). Pomija stare konta sprzed zmiany na kwoty.
const ESCROW_SIZE = 1222;
export function myContracts(wallet: web3.PublicKey, role: "freelancer" | "client") {
  const offset = role === "freelancer" ? FREELANCER_OFFSET : CLIENT_OFFSET;
  return getProgram(null).account.escrow.all([
    { dataSize: ESCROW_SIZE },
    { memcmp: { offset, bytes: wallet.toBase58() } },
  ]);
}

// Status umowy do wyświetlenia: [tekst, klasa koloru daisyUI].
export function contractStatus(escrow: Escrow, now = Date.now() / 1000): [string, string] {
  if (!escrow.client)
    return now < escrow.offerExpiresAt.toNumber() ? ["Czeka na przyjęcie", "badge-info"] : ["Oferta wygasła", "badge-warning"];
  return now < escrow.deadline.toNumber() ? ["W realizacji", "badge-primary"] : ["Po deadlinie", "badge-warning"];
}

export const sol = (lamports: BN | number) =>
  `${(Number(lamports) / 1e9).toLocaleString("pl-PL", { maximumFractionDigits: 9 })} SOL`;

// Losowy nonce (u64), żeby każda umowa wykonawcy miała inny adres.
export const randomNonce = () => new BN(crypto.getRandomValues(new Uint8Array(8)), "le");

export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
export const explorerAddress = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;

// Błędy programu (nazwy z LinkDealError w lib.rs) po polsku.
const PROGRAM_ERRORS: Record<string, string> = {
  ZeroAmount: "Każdy milestone musi mieć kwotę większą od zera.",
  AmountTooLarge: "Kwota zlecenia jest za duża.",
  BadDates: "Oferta musi być ważna w przyszłości i wygasać nie później niż deadline.",
  BadTaskCount: "Oferta musi mieć od 1 do 10 milestone'ów.",
  BadDescription: "Opis milestone'u musi mieć od 1 do 100 znaków.",
  AlreadyFunded: "Ta oferta została już przyjęta.",
  OfferExpired: "Oferta wygasła i nie można jej już przyjąć.",
  DeadlinePassed: "Deadline minął, więc nie można już zaliczać milestone'ów.",
  NotClient: "Tylko zleceniodawca może to zrobić.",
  OfferStillValid: "Ofertę można anulować dopiero po jej wygaśnięciu.",
  DeadlineNotPassed: "Deadline jeszcze nie minął.",
};

// Zamienia techniczne błędy na komunikat dla człowieka.
export function errorMessage(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  const code = Object.keys(PROGRAM_ERRORS).find((name) => message.includes(`Error Code: ${name}`));
  if (code) return PROGRAM_ERRORS[code];
  if (message.includes("Blockhash not found"))
    return "Transakcja wygasła, zanim została zatwierdzona w portfelu (na devnecie jest ważna ok. 30 s). Spróbuj ponownie.";
  if (/rejected/i.test(message)) return "Anulowano podpisywanie w portfelu.";
  if (/insufficient|no record of a prior credit/i.test(message)) return "Masz za mało SOL w portfelu.";
  return message;
}
