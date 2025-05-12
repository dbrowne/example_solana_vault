import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import BN from "bn.js";

describe("large value deposit + withdraw", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.Vault as Program;

  it("handles max safe u64 deposit and withdraw", async () => {
    const admin = Keypair.generate();
    const user = Keypair.generate();

    // Airdrop SOL
    await provider.connection.confirmTransaction(
  await provider.connection.requestAirdrop(admin.publicKey, 2e9),
  "confirmed"
    );

await provider.connection.confirmTransaction(
  await provider.connection.requestAirdrop(user.publicKey, 2e9),
  "confirmed"
);


    const usdcMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Get PDA addresses
    const [vaultState] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault-state"), admin.publicKey.toBuffer()],
      program.programId
    );
    const [vaultAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );
    const [vaultDeposit] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault-deposit"), vaultState.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const receiptMint = await createMint(
      provider.connection,
      admin,
      vaultAuth,
      null,
      6
    );

    const vaultUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        usdcMint,
        vaultAuth,
        true
      )
    ).address;
    const userUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        usdcMint,
        user.publicKey
      )
    ).address;
    const userReceipt = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        receiptMint,
        user.publicKey
      )
    ).address;

    const MAX_DEPOSIT = new BN("1000000000000"); // 1 trillion USDC (10^12)

    await mintTo(
      provider.connection,
      admin,
      usdcMint,
      userUsdc,
      admin,
      BigInt(MAX_DEPOSIT.toString()) // safe because it's less than u64::MAX
    );

    // Initialize vault
    await program.methods
      .initializeVaultState()
      .accounts({ vaultState, admin: admin.publicKey })
      .signers([admin])
      .signers([admin])

    await program.methods
      .initializeDeposit()
      .accounts({
        vaultState,
        vaultDeposit,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])

    // Deposit
    await program.methods
      .deposit(MAX_DEPOSIT)
      .accounts({
        user: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultDeposit,
        vaultAuth,
        vaultState,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .signers([admin])

    // Withdraw
    await program.methods
      .withdraw(MAX_DEPOSIT)
      .accounts({
        vaultDeposit,
        owner: user.publicKey,
        userUsdc,
        userReceipt,
        vaultUsdc,
        receiptMint,
        vaultAuth,
        vaultState,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([user])
      .signers([admin])

    const finalUserBalance = await provider.connection.getTokenAccountBalance(userUsdc);
    assert.equal(finalUserBalance.value.amount, MAX_DEPOSIT.toString());
  });
});
