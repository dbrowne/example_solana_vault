# 🔐 Solana RWA Vault

A secure, interest-accruing vault built with Anchor and Solana to simulate tokenized RWA (Real World Asset) exposure.

solana --version
solana-cli 2.1.22 (src:3861dceb; feat:1416569292, client:Agave)

anchor --version
anchor-cli 0.31.1

---

## ✅ Features

- **Deposit USDC** and receive receipt tokens (1:1)
- **Simulated APR (5%)** grows share value over time
- **Withdraw principal + yield** based on current token price
- **Receipt tokens** burned on withdrawal
- **Fixed-point price logic** (scaled by 1e6)
- **Permissioned mint authority** via PDA (`vaultAuth`)

---

## 💸 Price Growth Logic

```rust
receipt_token_price += receipt_token_price * rate * elapsed / seconds_per_year

## 🧪 Test Coverage
Case
- Deposit and mint receipt tokens	✅
- Full withdrawal with interest	✅
- Interest accrual via update_price	✅
- Zero-value deposit and withdrawal	✅
- Over-withdrawal protection	✅
- Unauthorized user cannot withdraw	✅
- Admin-only control on price manipulation	✅
- Large value Deposit/withdraw	✅

## 🧱 Components
- VaultState: Stores price, last update, admin

- VaultDeposit: Per-user deposit tracking

- receiptMint: Receipt token SPL mint

- vaultAuth: PDA used for signing USDC transfers

## 🛠 Simulated RWA Yield
Tests simulate yield by minting USDC into the vault before withdrawal. No oracle or on-chain RWA integration yet — logic is designed to extend cleanly.

## 🛡 Security Notes
- Enforces ownership for deposits and withdrawals

- Prevents underflow and overflow via checked_* ops

- Rejects 0-amount transactions

- Uses PDAs for vault authority



## 🧩 Appendix: Deferred or Excluded Features

While the vault meets core requirements, the following advanced or optional features were intentionally excluded or deferred:

### 🔒 Security Tests (Deferred)
- Spoofed PDA usage or forged authority tests
- Cross-program invocation simulations
- Front-end misdirection simulation (e.g. fake signer prompt)

### 📡 Oracle Integration
- No live token price or Chainlink/Pyth oracle feeds
- Fixed-rate APR simulated instead

### 📈 Dynamic Yield Modeling
- No compound interest or rate rebalancing (e.g. based on vault utilization or asset risk)

### 🧪 Protocol Review
- No formal improvement proposal for Yearn, Maple, Veda, or Aave
- (Reserved for future stretch task)

### 🛠 Developer Utilities
- No emitted events (`emit!()`) for deposit/withdraw/update
- No CLI or web UI demonstration layer
- No TypeDoc or IDL-to-docsite integration



#Thread mitigation



ChatGPT said:
To protect users from fake Squads multisig front-ends, the vault program should always check that critical actions like updating prices or initializing the vault can only be done by a known and verified signer. This usually means using a PDA (program-derived address) that’s tied to the actual Squads multisig program. These addresses should be predictable and shown clearly in the UI so users can verify them. You can also bake in checks like “is this admin the expected signer?” to catch anyone trying to spoof authority through a sketchy front-end.

Fake or compromised transaction simulations are another risk, especially when users rely on simulations to decide whether to approve a transaction. To deal with that, it’s important to validate everything on-chain. For example, even if the frontend looks fine, if a user tries to deposit zero or withdraw too much, the on-chain program should throw an error. You can even include guards like pre-instructions or hash checks to confirm that what the user simulated is actually what they’re signing and sending to the network.

Additionally, it’s good to give users tools or logging info that helps them see what’s really going on in a transaction. Open-source simulation tools or CLI scripts that walk through the transaction and explain which accounts are being used (and whether they’re signers) can make a big difference. The more visibility users have into what they’re signing—especially around vaultAuth, receiptMint, or the vaultState—the harder it is for attackers to trick them.
