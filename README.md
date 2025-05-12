# 🔐 Solana RWA Vault

A secure, interest-accruing vault built with Anchor and Solana to simulate tokenized Real World Asset (RWA) exposure.

**Versions used:**
- `solana-cli`: 2.1.22 (`solana --version`)
- `anchor-cli`: 0.31.1 (`anchor --version`)

---

## ✅ Features

- 💰 Deposit **USDC** and receive 1:1 **receipt tokens**
- 📈 Simulated **5% APR**, price increases over time
- 🏦 **Withdraw principal + interest**, based on receipt token price
- 🔥 Receipt tokens are **burned** on withdrawal
- 🧮 **Fixed-point arithmetic**, token price scaled by 1e6
- 🔐 **Permissioned authority** via PDA (`vaultAuth`)

---

## 💸 Price Growth Logic

```rust
receipt_token_price += receipt_token_price * rate * elapsed / seconds_per_year;
```

---

## 🧪 Test Coverage

| Case                                         | Status |
|---------------------------------------------|--------|
| Deposit and mint receipt tokens             | ✅     |
| Full withdrawal with interest               | ✅     |
| Interest accrual via `update_price`         | ✅     |
| Zero-value deposit and withdrawal           | ✅     |
| Over-withdrawal protection                  | ✅     |
| Unauthorized user cannot withdraw           | ✅     |
| Admin-only control on price manipulation    | ✅     |
| Large-value deposit and withdrawal          | ✅     |

---

## 🧱 Program Components

- **`VaultState`**: Tracks token price, last update, and admin
- **`VaultDeposit`**: Tracks individual user deposits
- **`receiptMint`**: SPL token mint for receipt tokens
- **`vaultAuth`**: PDA for authorizing USDC transfers

---

## 🛠 Simulated RWA Yield

- Yield is simulated by minting USDC directly to the vault before withdrawal.
- No live oracle or on-chain RWA connection is implemented yet.
- Logic is modular and ready for extension.

---

## 🛡 Security Notes

- Enforces **ownership checks** on all deposit and withdrawal actions
- Prevents underflow and overflow using `checked_*` arithmetic
- Rejects **zero-value** deposits and withdrawals
- All privileged transfers must be signed by a **PDA** (`vaultAuth`)

---

## 🔍 Threat Mitigation

To protect against **fake Squads multisig front-ends**, the program ensures that only a known, hardcoded PDA can authorize critical actions like vault setup and price updates. These PDAs should be deterministic and displayed clearly in any UI to support user verification. Enforcing signer constraints at the instruction level adds a backstop against spoofing.

For **compromised transaction simulations**, the vault program performs all critical checks on-chain — rejecting invalid values, unauthorized accounts, or incorrect pricing logic. Using instruction guards and proper signer validation ensures that simulation mismatches won't translate into unexpected behavior.

Improving user tooling (e.g., open-source CLI or simulation scripts) also helps. By making it easier for users to inspect what they’re signing — including verifying signer addresses and vault PDAs — the protocol reduces its exposure to front-end attacks or hidden manipulations.

---

## 📚 Core Logic Summary

The core functionality lets users deposit USDC and receive receipt tokens that represent their share in the vault. Deposits trigger a transfer to the vault and mint receipt tokens 1:1 based on the current price. The token price increases over time using a fixed-rate APR model simulated by the `update_price` instruction.

Withdrawals burn receipt tokens and return the equivalent USDC, adjusted for price appreciation. Access control ensures only the deposit owner can withdraw, and errors are raised for unauthorized access, zero-amount operations, or insufficient balances. Edge cases like partial withdrawals and max-value operations are accounted for with checks and test coverage.

Overall, the implementation covers a variety of test cases: normal deposits and withdrawals, simulated yield accrual, zero-value rejections, protection against forged authority, and handling of high-value operations near the u64 limit. The vault logic is isolated and extendable, setting the foundation for future RWA integrations, dynamic yield models, or live oracle pricing.

---

## ⏳ Deferred or Excluded Features

### 🔒 Security Tests (Deferred)
- Forged PDA or spoofed signer simulations
- Cross-program invocation exploits
- Front-end misdirection scenarios

### 📡 Oracle Integration
- No live Chainlink or Pyth price feeds
- Fixed-rate APR simulation used instead

### 📈 Dynamic Yield Modeling
- No compound interest or utilization-based rebalancing yet

### 🧪 Protocol Review
- No formal audits or improvement proposals for Yearn, Maple, or Aave (stretch goal)

### 🛠 Developer Utilities
- No `emit!()` events for program instructions
- No CLI or Web UI layer
- No IDL documentation or typedocs generated
