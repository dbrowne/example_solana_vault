use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("Ep3XMXR7G1EcQNQRgoDCEMoE8XXZKMsUbAQ8hZxkxo3T");

/// Custom error codes for the vault program.
#[error_code]
pub enum CustomError {
    /// Withdrawal attempted by an unauthorized user.
    #[msg("Unauthorized withdrawal attempt.")]
    Unauthorized,

    /// Not enough funds available to process withdrawal.
    #[msg("Insufficient funds for withdrawal.")]
    InsufficientFunds,

    /// Arithmetic overflow (e.g., during fixed-point math).
    #[msg("Arithmetic overflow error")]
    Overflow,

    /// Amount must be nonzero for deposit or withdrawal.
    #[msg("Zero transaction error")]
    ZeroAmount,
}

/// Global vault state shared across all users.
///
/// - `admin`: Only address allowed to call admin functions like `update_price`.
/// - `receipt_token_price`: Price per receipt token in fixed-point (1e6 scale).
/// - `last_updated`: Unix timestamp of last price update.
#[account]
pub struct VaultState {
    pub admin: Pubkey,
    pub receipt_token_price: u64, // Scaled by 1e6, e.g., 1_000_000 = 1.0
    pub last_updated: i64,        // Unix timestamp
}

/// User-specific deposit state.
/// Tracks deposited USDC and issued receipt tokens.
#[account]
pub struct VaultDeposit {
    pub owner: Pubkey,
    pub deposited_amount: u64,
    pub receipt_token_amount: u64,
}
#[program]
pub mod vault {
    use super::*;

    /// For testing: directly set `last_updated` to simulate backdated growth
    pub fn set_vault_last_updated(ctx: Context<SetVaultLastUpdated>, new_ts: i64) -> Result<()> {
        ctx.accounts.vault_state.last_updated = new_ts;
        Ok(())
    }

    /// Create a VaultDeposit record for a user. Called once per user.
    pub fn initialize_deposit(ctx: Context<InitializeDeposit>) -> Result<()> {
        let deposit = &mut ctx.accounts.vault_deposit;
        deposit.owner = ctx.accounts.user.key();
        deposit.deposited_amount = 0;
        deposit.receipt_token_amount = 0;
        Ok(())
    }

    /// Initialize the global vault state with admin and fixed-point price.
    pub fn initialize_vault_state(ctx: Context<InitializeVaultState>) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.admin = ctx.accounts.admin.key();
        vault_state.receipt_token_price = 1_000_000; // 1.0 fixed-point
        vault_state.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Simulates APR by increasing `receipt_token_price` based on time delta.
    pub fn update_price(ctx: Context<UpdatePrice>) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;

        let now = Clock::get()?.unix_timestamp;
        let elapsed = now - vault_state.last_updated;

        let yearly_rate = 5_000; // 5% APR scaled by 1e5
        let seconds_per_year = 31_536_000i64; // 365 days

        // Compute price increase
        let increase = vault_state
            .receipt_token_price
            .checked_mul(yearly_rate as u64)
            .ok_or(CustomError::Overflow)?
            .checked_mul(elapsed as u64)
            .ok_or(CustomError::Overflow)?
            .checked_div(seconds_per_year as u64)
            .ok_or(CustomError::Overflow)?
            .checked_div(100_000)
            .ok_or(CustomError::Overflow)?;

        vault_state.receipt_token_price = vault_state
            .receipt_token_price
            .checked_add(increase)
            .ok_or(CustomError::Overflow)?;

        vault_state.last_updated = now;
        Ok(())
    }

    /// Deposit USDC into the vault and mint receipt tokens.
    ///
    /// Receipt amount = USDC amount ÷ receipt_token_price (scaled 1e6)
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, CustomError::ZeroAmount);
        let deposit = &mut ctx.accounts.vault_deposit;
        let vault_state = &ctx.accounts.vault_state;

        // Use fixed-point math (1_000_000 scale factor for precision)
        let receipt_price = vault_state.receipt_token_price; // e.g., 1_000_000 means 1:1
        let receipt_amount = amount
            .checked_mul(1_000_000)
            .ok_or(CustomError::Overflow)?
            .checked_div(receipt_price)
            .ok_or(CustomError::Overflow)?;

        // Update state
        deposit.deposited_amount = deposit
            .deposited_amount
            .checked_add(amount)
            .ok_or(CustomError::Overflow)?;

        deposit.receipt_token_amount = deposit
            .receipt_token_amount
            .checked_add(receipt_amount)
            .ok_or(CustomError::Overflow)?;

        // Transfer USDC from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.vault_usdc.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Mint receipt tokens to user
        let signer_seeds: &[&[u8]] = &[b"vault", &[ctx.bumps.vault_auth]];
        let signer: &[&[&[u8]]] = &[signer_seeds];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.receipt_mint.to_account_info(),
            to: ctx.accounts.user_receipt.to_account_info(),
            authority: ctx.accounts.vault_auth.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::mint_to(cpi_ctx, receipt_amount)?;

        Ok(())
    }

    /// Burn receipt tokens and withdraw USDC from the vault.
    ///
    /// USDC amount = receipt amount × receipt_token_price (scaled 1e6)
    pub fn withdraw(ctx: Context<Withdraw>, receipt_amount: u64) -> Result<()> {
        require!(receipt_amount > 0, CustomError::ZeroAmount);
        require_keys_eq!(
            ctx.accounts.vault_deposit.owner,
            ctx.accounts.owner.key(),
            CustomError::Unauthorized
        );

        let deposit = &mut ctx.accounts.vault_deposit;
        let vault_state = &ctx.accounts.vault_state;

        // Validate balances
        require!(
            deposit.receipt_token_amount >= receipt_amount,
            CustomError::InsufficientFunds
        );

        // Calculate USDC to withdraw using current price
        let usdc_amount = receipt_amount
            .checked_mul(vault_state.receipt_token_price)
            .ok_or(CustomError::Overflow)?
            .checked_div(1_000_000)
            .ok_or(CustomError::Overflow)?;

        // Burn receipt tokens
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.receipt_mint.to_account_info(),
                from: ctx.accounts.user_receipt.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::burn(burn_ctx, receipt_amount)?;

        // Transfer USDC back to user
        let signer_seeds: &[&[u8]] = &[b"vault", &[ctx.bumps.vault_auth]];
        let signer = &[signer_seeds];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.vault_auth.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, usdc_amount)?;

        // Update deposit state
        deposit.receipt_token_amount = deposit
            .receipt_token_amount
            .checked_sub(receipt_amount)
            .unwrap();

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeDeposit<'info> {
    #[account(init, payer = user, space = 8 + 32 + 8 + 8)]
    pub vault_deposit: Account<'info, VaultDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts required to deposit USDC into the vault.
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_receipt: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub receipt_mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault_deposit: Account<'info, VaultDeposit>,
    /// CHECK: vault_auth is a PDA derived from seed ["vault"], used as the program signer.
    #[account(seeds = [b"vault"], bump)]
    pub vault_auth: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_state: Account<'info, VaultState>,

    pub token_program: Program<'info, Token>,
}

/// Accounts required to withdraw USDC by burning receipt tokens.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault_deposit: Account<'info, VaultDeposit>,
    #[account(mut)]
    pub owner: Signer<'info>, // 👈 match field name with `has_one = owner`
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_receipt: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub receipt_mint: Account<'info, Mint>,
    #[account(seeds = [b"vault"], bump)]
    /// CHECK: vault authority PDA
    pub vault_auth: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_state: Account<'info, VaultState>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut, has_one = admin)]
    pub vault_state: Account<'info, VaultState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeVaultState<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 8)]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetVaultLastUpdated<'info> {
    #[account(mut, has_one = admin)]
    pub vault_state: Account<'info, VaultState>,
    pub admin: Signer<'info>,
}
