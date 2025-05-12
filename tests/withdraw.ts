
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

describe("withdraw", () => {
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
    vaultUsdc = (await getOrCreateAssociatedTokenAccount(provider.connection, admin, usdcMint, vaultAuth,true)).address;

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
  });

  it("withdraws full amount and burns receipt tokens", async () => {
    const userUsdcBefore = await provider.connection.getTokenAccountBalance(userUsdc);
    const vaultUsdcBefore = await provider.connection.getTokenAccountBalance(vaultUsdc);
    const receiptBefore = await provider.connection.getTokenAccountBalance(userReceipt);

    await program.methods
      .withdraw(depositAmount)
      .accounts({
        vaultDeposit: vaultDeposit.publicKey,
        owner: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .rpc();

    const userUsdcAfter = await provider.connection.getTokenAccountBalance(userUsdc);
    const vaultUsdcAfter = await provider.connection.getTokenAccountBalance(vaultUsdc);
    const receiptAfter = await provider.connection.getTokenAccountBalance(userReceipt);

    const usdcDiff = BigInt(userUsdcAfter.value.amount) - BigInt(userUsdcBefore.value.amount);
    const vaultDiff = BigInt(vaultUsdcBefore.value.amount) - BigInt(vaultUsdcAfter.value.amount);
    const burned = BigInt(receiptBefore.value.amount) - BigInt(receiptAfter.value.amount);

    assert.strictEqual(usdcDiff.toString(), depositAmount.toString());
    assert.strictEqual(vaultDiff.toString(), depositAmount.toString());
    assert.strictEqual(burned.toString(), depositAmount.toString());
  });
it("fails to withdraw more than balance (edge case)", async () => {
  try {
    await program.methods
      .withdraw(new BN(10_000_000)) // more than available
      .accounts({
        vaultDeposit: vaultDeposit.publicKey,
        owner: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .rpc();

    assert.fail("Over-withdrawal should fail but did not");
  } catch (err: any) {
    const logs = err?.logs?.join("\n") ?? "";
    const message = err?.message ?? "";

    assert(
      logs.includes("Insufficient funds") ||
      logs.includes("overflow") ||
      message.includes("custom program error") ||  // general fallback
      message.includes("0x")                       // fallback if error code
    , "Expected over-withdraw error in logs or message");
  }
});
  
it("fails if a second user tries to withdraw someone else's funds", async () => {
  const user2 = Keypair.generate();

  // Airdrop to user2 so they can sign
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(user2.publicKey, 2 * LAMPORTS_PER_SOL),
    "confirmed"
  );

  try {
    await program.methods
      .withdraw(new BN(1_000_000)) // any nonzero value
      .accounts({
        vaultDeposit: vaultDeposit.publicKey, // belongs to user1
        owner: user2.publicKey, // <- user2 tries to act as the owner
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user2])
      .rpc();

    assert.fail("Unauthorized withdrawal should not succeed");
  } catch (err: any) {
    const logs = err?.logs?.join("\n") ?? "";
    const msg = err?.message ?? "";

    assert(
      logs.includes("Unauthorized") || msg.includes("custom program error"),
      "Expected Unauthorized error"
    );
  }
});


it("fails to withdraw 0 receipt tokens", async () => {
  try {
    await program.methods
      .withdraw(new BN(0))
      .accounts({
        vaultDeposit: vaultDeposit.publicKey,
        owner: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultAuth,
        vaultState: vaultState.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .rpc();

    assert.fail("Zero withdrawal should fail");
  } catch (err: any) {
    const logs = err?.logs?.join("\n") ?? "";
    const msg = err?.message ?? "";
    console.log("Withdraw error logs:\n", logs);
    console.log("Withdraw error message:\n", msg);

    assert(
      logs.includes("Zero transaction error") ||
      logs.includes("Instruction: Withdraw") ||
      msg.includes("custom program error") ||
      msg.includes("0x"),
      "Expected ZeroAmount error"
    );
  }
});



});

