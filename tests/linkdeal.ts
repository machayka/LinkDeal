import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { assert } from "chai";
import { Linkdeal } from "../target/types/linkdeal";

const { PublicKey, Keypair, LAMPORTS_PER_SOL } = anchor.web3;
type PublicKey = anchor.web3.PublicKey;

describe("linkdeal", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.linkdeal as Program<Linkdeal>;
  const connection = anchor.getProvider().connection;

  // Portfel z ~/.config/solana/id.json płaci tylko opłaty za transakcje.
  // Wykonawca i zleceniodawca to osobne portfele, więc ich salda zmieniają się tylko o przelewy umowy.
  const freelancer = Keypair.generate();
  const client = Keypair.generate();
  const stranger = Keypair.generate();

  const AMOUNT = LAMPORTS_PER_SOL / 2;
  const TASKS = [
    { description: "Logo design", percent: 30 },
    { description: "Landing page", percent: 30 },
    { description: "Deployment", percent: 40 },
  ];

  const now = () => Math.floor(Date.now() / 1000);
  const balance = (key: PublicKey) => connection.getBalance(key);

  // Adres umowy = PDA z seedów ["escrow", wykonawca, nonce]. Ten adres trafia do linku.
  const escrowPda = (nonce: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), freelancer.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  // Tworzy umowę i zwraca jej adres. Czasy podawane w sekundach od teraz.
  let nextNonce = 1;
  async function createEscrow(tasks = TASKS, offerIn = 60, deadlineIn = 120) {
    const nonce = new BN(nextNonce++);
    await program.methods
      .createEscrow(nonce, new BN(AMOUNT), tasks, new BN(now() + deadlineIn), new BN(now() + offerIn))
      .accounts({ freelancer: freelancer.publicKey })
      .signers([freelancer])
      .rpc();
    return escrowPda(nonce);
  }

  const fund = (escrow: PublicKey) =>
    program.methods.fund().accounts({ client: client.publicKey, escrow }).signers([client]).rpc();

  const approve = (escrow: PublicKey, signer = client) =>
    program.methods
      .approveMilestone()
      .accounts({ client: signer.publicKey, freelancer: freelancer.publicKey, escrow })
      .signers([signer])
      .rpc();

  // Oczekuje, że transakcja się nie uda z danym błędem programu.
  async function expectError(tx: Promise<unknown>, code: string) {
    try {
      await tx;
      assert.fail("should have failed");
    } catch (e) {
      assert.include(String(e), code);
    }
  }

  before(async () => {
    // Zasilamy portfele na lokalnym validatorze.
    for (const wallet of [freelancer, client, stranger]) {
      const sig = await connection.requestAirdrop(wallet.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }
  });

  it("create_escrow stores contract terms", async () => {
    const pda = await createEscrow();
    const escrow = await program.account.escrow.fetch(pda);
    assert.ok(escrow.freelancer.equals(freelancer.publicKey));
    assert.isNull(escrow.client);
    assert.equal(escrow.amount.toNumber(), AMOUNT);
    assert.deepEqual(escrow.tasks, TASKS);
    assert.equal(escrow.approved, 0);
  });

  it("create_escrow rejects percentages not summing to 100", async () => {
    await expectError(createEscrow([{ description: "Only 90%", percent: 90 }]), "PercentSumNot100");
  });

  it("fund moves the full amount to the escrow and sets the client", async () => {
    const pda = await createEscrow();
    const before = await balance(pda);

    await fund(pda);

    assert.equal((await balance(pda)) - before, AMOUNT);
    const escrow = await program.account.escrow.fetch(pda);
    assert.ok(escrow.client!.equals(client.publicKey));
  });

  it("fund rejects a second payment", async () => {
    const pda = await createEscrow();
    await fund(pda);
    await expectError(fund(pda), "AlreadyFunded");
  });

  it("approve_milestone pays each task, last one closes the contract", async () => {
    const pda = await createEscrow();
    await fund(pda);
    const start = await balance(freelancer.publicKey);

    await approve(pda); // 30%
    assert.equal((await balance(freelancer.publicKey)) - start, AMOUNT * 0.3);

    await approve(pda); // 30%
    assert.equal((await balance(freelancer.publicKey)) - start, AMOUNT * 0.6);

    const leftInEscrow = await balance(pda); // 40% + rent
    await approve(pda); // ostatni task
    assert.equal((await balance(freelancer.publicKey)) - start, AMOUNT * 0.6 + leftInEscrow);
    assert.isNull(await connection.getAccountInfo(pda)); // konto umowy zamknięte
  });

  it("approve_milestone rejects anyone but the client", async () => {
    const pda = await createEscrow();
    await fund(pda);
    await expectError(approve(pda, stranger), "NotClient");
  });
});
