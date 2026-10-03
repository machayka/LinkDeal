import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { assert } from "chai";
import { Linkdeal } from "../target/types/linkdeal";

const { PublicKey, Keypair, LAMPORTS_PER_SOL } = anchor.web3;

describe("linkdeal", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.linkdeal as Program<Linkdeal>;
  const connection = anchor.getProvider().connection;
  const freelancer = anchor.getProvider().publicKey!; // portfel z ~/.config/solana/id.json
  const client = Keypair.generate(); // drugi portfel — zleceniodawca

  const AMOUNT = LAMPORTS_PER_SOL / 2;
  const TASKS = [
    { description: "Logo design", percent: 30 },
    { description: "Landing page", percent: 30 },
    { description: "Deployment", percent: 40 },
  ];

  const now = () => Math.floor(Date.now() / 1000);

  // Adres umowy = PDA z seedów ["escrow", wykonawca, nonce]. Ten adres trafia do linku.
  const escrowPda = (nonce: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), freelancer.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  // Tworzy umowę i zwraca jej adres. Czasy podawane w sekundach od teraz.
  let nextNonce = 1;
  async function createEscrow(tasks = TASKS, offerIn = 60, deadlineIn = 120) {
    const nonce = new BN(nextNonce++);
    await program.methods
      .createEscrow(nonce, new BN(AMOUNT), tasks, new BN(now() + deadlineIn), new BN(now() + offerIn))
      .accounts({ freelancer })
      .rpc();
    return escrowPda(nonce);
  }

  const fund = (escrow: anchor.web3.PublicKey) =>
    program.methods.fund().accounts({ client: client.publicKey, escrow }).signers([client]).rpc();

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
    // Zasilamy zleceniodawcę na lokalnym validatorze.
    const sig = await connection.requestAirdrop(client.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  });

  it("create_escrow stores contract terms", async () => {
    const pda = await createEscrow();
    const escrow = await program.account.escrow.fetch(pda);
    assert.ok(escrow.freelancer.equals(freelancer));
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
    const before = await connection.getBalance(pda);

    await fund(pda);

    assert.equal((await connection.getBalance(pda)) - before, AMOUNT);
    const escrow = await program.account.escrow.fetch(pda);
    assert.ok(escrow.client!.equals(client.publicKey));
  });

  it("fund rejects a second payment", async () => {
    const pda = await createEscrow();
    await fund(pda);
    await expectError(fund(pda), "AlreadyFunded");
  });
});
