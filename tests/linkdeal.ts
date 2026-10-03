import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Linkdeal } from "../target/types/linkdeal";

describe("linkdeal", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.linkdeal as Program<Linkdeal>;

  it("ping", async () => {
    const sig = await program.methods.ping().rpc();
    console.log("tx:", sig);
  });
});
