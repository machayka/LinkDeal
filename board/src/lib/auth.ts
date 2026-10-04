// Sprawdzenie podpisu portfela po stronie serwera — zamiast loginu i hasła.
import bs58 from "bs58";
import nacl from "tweetnacl";

const MAX_AGE_MS = 5 * 60 * 1000; // podpis ważny 5 minut

// true, jeśli `message` podpisał właściciel portfela `address`, a podpis jest świeży.
export function isValidSignature(message: string, signatureBase64: string, address: string, timestamp: number) {
  if (!(Math.abs(Date.now() - timestamp) < MAX_AGE_MS)) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Uint8Array.from(Buffer.from(signatureBase64, "base64")),
      bs58.decode(address), // adres portfela Solany to po prostu klucz publiczny ed25519
    );
  } catch {
    return false; // zły format adresu albo podpisu
  }
}
