// Portfele przez Wallet Standard (Phantom, Solflare, Backpack…). W ogłoszeniach portfel tylko podpisuje
// wiadomości — to nasze „logowanie”. Żadnych transakcji ani pieniędzy.
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import type { StandardConnectFeature } from "@wallet-standard/features";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";

const STORAGE_KEY = "linkdeal:wallet"; // nazwa ostatniego portfela, żeby połączyć się ponownie po przejściu na inną stronę

export type ConnectedWallet = {
  address: string; // adres portfela (base58)
  signMessage(message: string): Promise<string>; // zwraca podpis w base64
};

let current: ConnectedWallet | null = null;
const listeners: ((wallet: ConnectedWallet | null) => void)[] = [];

// Wywołuje `callback` od razu i przy każdej zmianie portfela.
export function onWalletChange(callback: (wallet: ConnectedWallet | null) => void) {
  listeners.push(callback);
  callback(current);
}

function setCurrent(wallet: ConnectedWallet | null) {
  current = wallet;
  listeners.forEach((callback) => callback(wallet));
}

// Portfele, które umieją się połączyć i podpisać wiadomość.
export function availableWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => "standard:connect" in w.features && SolanaSignMessage in w.features);
}

export function onWalletsRegistered(callback: () => void) {
  getWallets().on("register", callback);
}

export async function connect(wallet: Wallet, silent = false) {
  const { connect } = (wallet.features as StandardConnectFeature)["standard:connect"];
  const { accounts } = await connect({ silent });
  const account = accounts[0];
  if (!account) return;

  const { signMessage } = (wallet.features as SolanaSignMessageFeature)[SolanaSignMessage];

  localStorage.setItem(STORAGE_KEY, wallet.name);
  setCurrent({
    address: account.address,
    async signMessage(message) {
      const [{ signature }] = await signMessage({ account, message: new TextEncoder().encode(message) });
      return btoa(String.fromCharCode(...signature));
    },
  });
}

export function disconnect() {
  localStorage.removeItem(STORAGE_KEY);
  setCurrent(null);
}

// Po wejściu na stronę: jeśli użytkownik wcześniej się połączył, łączymy po cichu (bez okienka).
export function reconnect() {
  const name = localStorage.getItem(STORAGE_KEY);
  const wallet = availableWallets().find((w) => w.name === name);
  if (wallet) connect(wallet, true).catch(() => disconnect());
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
