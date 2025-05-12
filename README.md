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



