// Portfele przez Wallet Standard: każdy zgodny portfel (Phantom, Solflare, Backpack…) sam się tu rejestruje.
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import type { StandardConnectFeature } from "@wallet-standard/features";
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import { web3 } from "@anchor-lang/core";

const CHAIN = "solana:devnet";
const STORAGE_KEY = "linkdeal:wallet"; // nazwa ostatniego portfela, żeby połączyć się ponownie po przejściu na inną stronę

// Tego kształtu oczekuje Anchor.
export type AnchorWallet = {
  publicKey: web3.PublicKey;
  signTransaction<T extends web3.Transaction | web3.VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends web3.Transaction | web3.VersionedTransaction>(txs: T[]): Promise<T[]>;
};

let current: AnchorWallet | null = null;
const listeners: ((wallet: AnchorWallet | null) => void)[] = [];

// Wywołuje `callback` od razu i przy każdej zmianie portfela.
export function onWalletChange(callback: (wallet: AnchorWallet | null) => void) {
  listeners.push(callback);
  callback(current);
}

function setCurrent(wallet: AnchorWallet | null) {
  current = wallet;
  listeners.forEach((callback) => callback(wallet));
}

// Portfele, które umieją się połączyć i podpisać transakcję Solany.
export function availableWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => "standard:connect" in w.features && SolanaSignTransaction in w.features);
}

export function onWalletsRegistered(callback: () => void) {
  getWallets().on("register", callback);
}

export async function connect(wallet: Wallet, silent = false) {
  const { connect } = (wallet.features as StandardConnectFeature)["standard:connect"];
  const { accounts } = await connect({ silent });
  const account = accounts[0];
  if (!account) return;

  const { signTransaction } = (wallet.features as SolanaSignTransactionFeature)[SolanaSignTransaction];

  // Anchor daje obiekt transakcji, portfel chce bajty — zamieniamy w obie strony.
  async function sign<T extends web3.Transaction | web3.VersionedTransaction>(tx: T): Promise<T> {
    const bytes =
      tx instanceof web3.VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false });
    const [{ signedTransaction }] = await signTransaction({ account, transaction: bytes, chain: CHAIN });
    return (
      tx instanceof web3.VersionedTransaction
        ? web3.VersionedTransaction.deserialize(signedTransaction)
        : web3.Transaction.from(signedTransaction)
    ) as T;
  }

  localStorage.setItem(STORAGE_KEY, wallet.name);
  setCurrent({
    publicKey: new web3.PublicKey(account.address),
    signTransaction: sign,
    signAllTransactions: (txs) => Promise.all(txs.map(sign)),
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
