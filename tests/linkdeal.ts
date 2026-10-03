import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { assert } from "chai";
import { Linkdeal } from "../target/types/linkdeal";

const { PublicKey, LAMPORTS_PER_SOL } = anchor.web3;

describe("linkdeal", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.linkdeal as Program<Linkdeal>;
  const freelancer = anchor.getProvider().publicKey!;

  // Adres umowy = PDA z seedów ["escrow", wykonawca, nonce]. Ten adres trafia do linku.
  const escrowPda = (nonce: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), freelancer.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  const now = () => Math.floor(Date.now() / 1000);

  it("create_escrow stores contract terms", async () => {
    const nonce = new BN(1);
    const tasks = [
      { description: "Logo design", percent: 30 },
      { description: "Landing page", percent: 30 },
      { description: "Deployment", percent: 40 },
    ];

    await program.methods
      .createEscrow(nonce, new BN(LAMPORTS_PER_SOL / 2), tasks, new BN(now() + 120), new BN(now() + 60))
      .accounts({ freelancer })
      .rpc();

    const escrow = await program.account.escrow.fetch(escrowPda(nonce));
    assert.ok(escrow.freelancer.equals(freelancer));
    assert.isNull(escrow.client);
    assert.equal(escrow.amount.toNumber(), LAMPORTS_PER_SOL / 2);
    assert.deepEqual(escrow.tasks, tasks);
    assert.equal(escrow.approved, 0);
  });

  it("create_escrow rejects percentages not summing to 100", async () => {
    try {
      await program.methods
        .createEscrow(
          new BN(2),
          new BN(LAMPORTS_PER_SOL),
          [{ description: "Only 90%", percent: 90 }],
          new BN(now() + 120),
          new BN(now() + 60),
        )
        .accounts({ freelancer })
        .rpc();
      assert.fail("should have failed");
    } catch (e) {
      assert.include(String(e), "PercentSumNot100");
    }
  });
});
