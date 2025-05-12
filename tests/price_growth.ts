import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import BN from "bn.js";
import { Vault } from "../target/types/vault";

describe("vault apr growth", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Vault as anchor.Program<Vault>;
  const connection = provider.connection;

  let admin: Keypair;
  let vaultState: Keypair;
  let vaultDeposit: Keypair;
  let vaultAuth: anchor.web3.PublicKey;
  let receiptMint: anchor.web3.PublicKey;
  let vaultUsdc: anchor.web3.PublicKey;
  let user: Keypair;
  let userUsdc: anchor.web3.PublicKey;
  let userReceipt: anchor.web3.PublicKey;
  let usdcMint: anchor.web3.PublicKey;

  before(async () => {
    const payer = provider.wallet.payer as anchor.web3.Signer;
    if (!payer) throw new Error("payer not found");

    admin = Keypair.generate();
    user = Keypair.generate();
    vaultState = Keypair.generate();
    vaultDeposit = Keypair.generate();

    vaultAuth = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    )[0];

    for (const kp of [admin, user]) {
      await connection.confirmTransaction(
        await connection.requestAirdrop(kp.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
        "confirmed"
      );
    }

    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    receiptMint = await createMint(connection, admin, vaultAuth, null, 6);

    userUsdc = (
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, user.publicKey)
    ).address;

    userReceipt = (
      await getOrCreateAssociatedTokenAccount(connection, admin, receiptMint, user.publicKey)
    ).address;

    vaultUsdc = (
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, vaultAuth, true)
    ).address;

    await mintTo(connection, admin, usdcMint, userUsdc, admin, 5_000_000);

    const info = await connection.getAccountInfo(vaultState.publicKey);
    if (!info) {
      await program.methods
        .initializeVaultState()
        .accounts({
          vaultState: vaultState.publicKey,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([admin, vaultState])
        .rpc();
    }

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
      .deposit(new BN(5_000_000))
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

  it("increases withdrawal amount after price update", async () => {
    const before = await provider.connection.getTokenAccountBalance(userUsdc);

// Simulate time passage (e.g., 1 year)
const now = (await provider.connection.getBlockTime(await provider.connection.getSlot()))!;
const vault = await program.account.vaultState.fetch(vaultState.publicKey);
const backdatedTs = Math.floor(Date.now() / 1000) - 31_536_000; // 1 year ago


await program.methods
  .setVaultLastUpdated(new BN(backdatedTs))
  .accounts({
    vaultState: vaultState.publicKey,
    admin: admin.publicKey,
  } as any)
  .signers([admin])
  .rpc();



    for (let i = 0; i < 10; i++){

    await program.methods
      .updatePrice()
      .accounts({
        vaultState: vaultState.publicKey,
        admin: admin.publicKey,
      } as any)
      .signers([admin])
      .rpc();
    }
    const receiptAccount = await getAccount(provider.connection, userReceipt);
const receiptBalance = BigInt(receiptAccount.amount);
await mintTo(
  provider.connection,
  admin, // payer
  usdcMint,
  vaultUsdc, // destination
  admin, // authority
  1_000_000 // top off vault to pay interest
);


// withdraw slightly less than full to avoid rounding errors
const withdrawAmount = new BN("4999000");

    await program.methods
      .withdraw(new BN(withdrawAmount))
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

    const after = await provider.connection.getTokenAccountBalance(userUsdc);
    const delta = BigInt(after.value.amount) - BigInt(before.value.amount);

    assert(delta > 5_000_000n, `Expected gain from interest. Got: ${delta}`);
  });
});


