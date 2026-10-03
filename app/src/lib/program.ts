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

// Losowy nonce (u64), żeby każda umowa wykonawcy miała inny adres.
export const randomNonce = () => new BN(crypto.getRandomValues(new Uint8Array(8)), "le");

export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
export const explorerAddress = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;

// Zamienia techniczne błędy na komunikat dla człowieka.
export function errorMessage(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("Blockhash not found"))
    return "Transakcja wygasła, zanim została zatwierdzona w portfelu (na devnecie jest ważna ok. 30 s). Spróbuj ponownie.";
  return message;
}
