// Anchor w przeglądarce potrzebuje Buffer (w Node jest wbudowany). Musi być przed importem Anchora.
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { AnchorProvider, Program, web3 } from "@anchor-lang/core";
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

export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
export const explorerAddress = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;
