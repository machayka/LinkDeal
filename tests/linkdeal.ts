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

  // Kwoty milestone'ów w lamportach; kwota zlecenia to ich suma (0,5 SOL).
  const MILESTONES = [150_000_000, 150_000_000, 200_000_000];
  const AMOUNT = MILESTONES.reduce((a, b) => a + b, 0);
  const TASKS = [
    { description: "Logo design", amount: new BN(MILESTONES[0]) },
    { description: "Landing page", amount: new BN(MILESTONES[1]) },
    { description: "Deployment", amount: new BN(MILESTONES[2]) },
  ];

  // Czas blockchaina (sysvar Clock), a nie komputera — lokalny Surfpool ma własny zegar.
  const now = async () => {
    const clock = await connection.getAccountInfo(anchor.web3.SYSVAR_CLOCK_PUBKEY);
    return Number(clock!.data.readBigInt64LE(32)); // pole unix_timestamp
  };

  // Przesuwa zegar lokalnego blockchaina o `seconds` do przodu (funkcja tylko Surfpoola).
  // Dzięki temu testy deadline'ów nie muszą czekać.
  async function timeTravel(seconds: number) {
    const absoluteTimestamp = ((await now()) + seconds) * 1000; // w milisekundach
    await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "surfnet_timeTravel", params: [{ absoluteTimestamp }] }),
    });
  }

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
    const t = await now();
    await program.methods
      .createEscrow(nonce, tasks, new BN(t + deadlineIn), new BN(t + offerIn))
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

  // cancel i refund może wywołać każdy — w testach podpisuje (płaci opłatę) domyślny portfel.
  const cancel = (escrow: PublicKey) =>
    program.methods.cancel().accounts({ freelancer: freelancer.publicKey, escrow }).rpc();

  const refund = (escrow: PublicKey) =>
    program.methods
      .refundAfterDeadline()
      .accounts({ client: client.publicKey, freelancer: freelancer.publicKey, escrow })
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
    assert.deepEqual(
      escrow.tasks.map((task) => [task.description, task.amount.toNumber()]),
      TASKS.map((task) => [task.description, task.amount.toNumber()]),
    );
    assert.equal(escrow.approved, 0);
  });

  it("create_escrow rejects a milestone with zero amount", async () => {
    await expectError(createEscrow([{ description: "Free work", amount: new BN(0) }]), "ZeroAmount");
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

    await approve(pda); // milestone 1
    assert.equal((await balance(freelancer.publicKey)) - start, MILESTONES[0]);

    await approve(pda); // milestone 2
    assert.equal((await balance(freelancer.publicKey)) - start, MILESTONES[0] + MILESTONES[1]);

    const leftInEscrow = await balance(pda); // milestone 3 + rent
    await approve(pda); // ostatni milestone
    assert.equal((await balance(freelancer.publicKey)) - start, MILESTONES[0] + MILESTONES[1] + leftInEscrow);
    assert.isNull(await connection.getAccountInfo(pda)); // konto umowy zamknięte
  });

  it("approve_milestone rejects anyone but the client", async () => {
    const pda = await createEscrow();
    await fund(pda);
    await expectError(approve(pda, stranger), "NotClient");
  });

  it("cancel is rejected while the offer is still valid", async () => {
    const pda = await createEscrow();
    await expectError(cancel(pda), "OfferStillValid");
  });

  it("cancel closes an unfunded contract after the offer expires", async () => {
    const pda = await createEscrow(TASKS, 2, 4); // oferta ważna 2 s
    const rent = await balance(pda);
    const start = await balance(freelancer.publicKey);

    await timeTravel(3);
    await cancel(pda);

    assert.equal((await balance(freelancer.publicKey)) - start, rent);
    assert.isNull(await connection.getAccountInfo(pda));
  });

  it("refund_after_deadline is rejected before the deadline", async () => {
    const pda = await createEscrow();
    await fund(pda);
    await expectError(refund(pda), "DeadlineNotPassed");
  });

  // Przykład z dokumentacji: milestone 1 zaliczony, reszta wraca do zleceniodawcy po deadlinie.
  it("refund_after_deadline returns the unpaid rest to the client", async () => {
    const pda = await createEscrow(TASKS, 2, 4); // deadline za 4 s
    await fund(pda);
    await approve(pda); // milestone 1
    const rest = AMOUNT - MILESTONES[0];
    const rent = (await balance(pda)) - rest;
    const clientStart = await balance(client.publicKey);
    const freelancerStart = await balance(freelancer.publicKey);

    await timeTravel(5);
    await expectError(approve(pda), "DeadlinePassed"); // po deadlinie nie da się już zaliczyć
    await refund(pda);

    assert.equal((await balance(client.publicKey)) - clientStart, rest);
    assert.equal((await balance(freelancer.publicKey)) - freelancerStart, rent);
    assert.isNull(await connection.getAccountInfo(pda));
  });
});
