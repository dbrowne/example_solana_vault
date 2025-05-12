import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Vault } from "../target/types/vault";

describe("initialize_deposit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Vault as anchor.Program<Vault>;

  it("Initializes a vault deposit", async () => {
    const vaultDeposit = Keypair.generate();

    await program.methods
      .initializeDeposit()
      .accounts({
        vaultDeposit: vaultDeposit.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any) // 👈 workaround for TS2353
      .signers([vaultDeposit])
      .rpc();

    const depositState = await program.account.vaultDeposit.fetch(
      vaultDeposit.publicKey
    );

    assert.ok(depositState.owner.equals(provider.wallet.publicKey));
    assert.strictEqual(depositState.depositedAmount.toNumber(), 0);
    assert.strictEqual(depositState.receiptTokenAmount.toNumber(), 0);
  });
});

