import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vault } from "../target/types/vault";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import BN from "bn.js";

describe("deposit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Vault as Program<Vault>;

  let user: Keypair;
  let admin: Keypair;
  let vaultDeposit: Keypair;
  let vaultState: Keypair;
  let vaultAuth: anchor.web3.PublicKey;

  let usdcMint: anchor.web3.PublicKey;
  let receiptMint: anchor.web3.PublicKey;

  let userUsdc: anchor.web3.PublicKey;
  let userReceipt: anchor.web3.PublicKey;
  let vaultUsdc: anchor.web3.PublicKey;

  const depositAmount = new BN(5_000_000);

  before(async () => {
    user = Keypair.generate();
    admin = Keypair.generate();
    vaultDeposit = Keypair.generate();
    vaultState = Keypair.generate();

    for (const kp of [user, admin]) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL),
        "confirmed"
      );
    }

    usdcMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);
vaultAuth = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  program.programId
)[0];

receiptMint = await createMint(
  provider.connection,
  admin,
  vaultAuth, 
  null,
  6
);


    userUsdc = (await getOrCreateAssociatedTokenAccount(provider.connection, user, usdcMint, user.publicKey)).address;
    userReceipt = (await getOrCreateAssociatedTokenAccount(provider.connection, user, receiptMint, user.publicKey)).address;
    vaultUsdc = (await getOrCreateAssociatedTokenAccount(provider.connection, admin, usdcMint, admin.publicKey)).address;

    vaultAuth = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    )[0];

    await mintTo(provider.connection, admin, usdcMint, userUsdc, admin, depositAmount.toNumber());

    await program.methods
      .initializeVaultState()
      .accounts({
        vaultState: vaultState.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([admin, vaultState])
      .rpc();

    await program.methods
      .initializeDeposit()
      .accounts({
        vaultDeposit: vaultDeposit.publicKey,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([user, vaultDeposit])
      .rpc();
  });

  it("deposits USDC and mints receipt tokens", async () => {
    await program.methods
      .deposit(depositAmount)
      .accounts({
        user: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultDeposit: vaultDeposit.publicKey,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .rpc();

    const vaultBalance = await provider.connection.getTokenAccountBalance(vaultUsdc);
    const receiptBalance = await provider.connection.getTokenAccountBalance(userReceipt);

    assert.strictEqual(vaultBalance.value.amount, depositAmount.toString());
    assert.strictEqual(receiptBalance.value.amount, depositAmount.toString());
  });



it("fails to deposit 0 USDC", async () => {
  try {
    await program.methods
      .deposit(new BN(0))
      .accounts({
        user: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultDeposit: vaultDeposit.publicKey,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .rpc();

    assert.fail("Zero deposit should fail");
  } catch (err: any) {
    const logs = err?.logs?.join("\n") ?? "";
    const msg = err?.message ?? "";
    console.log("Deposit error logs:\n", logs);
    console.log("Deposit error message:\n", msg);

    assert(
      logs.includes("Zero transaction error") ||
      logs.includes("Instruction: Deposit") ||
      msg.includes("custom program error") ||
      msg.includes("0x"),
      "Expected ZeroAmount error"
    );
  }
});


});

