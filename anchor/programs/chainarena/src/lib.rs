use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("ChainArena111111111111111111111111111111111");

#[program]
pub mod chainarena {
    use super::*;

    /// Initialize a new tournament with its details and escrow vault setup.
    pub fn initialize_tournament(
        ctx: Context<InitializeTournament>,
        tournament_id: String,
        entry_fee: u64,
        max_players: u32,
        base_prize_pool: u64,
        is_usdc: bool,
    ) -> Result<()> {
        let tournament = &mut ctx.accounts.tournament;
        tournament.organizer = ctx.accounts.organizer.key();
        tournament.tournament_id = tournament_id;
        tournament.entry_fee = entry_fee;
        tournament.max_players = max_players;
        tournament.base_prize_pool = base_prize_pool;
        tournament.is_usdc = is_usdc;
        tournament.current_players = 0;
        tournament.status = TournamentStatus::Registration;
        tournament.bump = ctx.bumps.tournament;
        
        // If it's a native SOL tournament and there is a sponsored base prize pool,
        // we transfer the base prize pool from the organizer to the tournament vault
        if !is_usdc && base_prize_pool > 0 {
            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.organizer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    amount: base_prize_pool,
                },
            );
            anchor_lang::system_program::transfer(cpi_context)?;
        }
        
        Ok(())
    }

    /// Register a player for the tournament and deposit their entry fee in the escrow vault.
    pub fn join_tournament(ctx: Context<JoinTournament>) -> Result<()> {
        let tournament = &mut ctx.accounts.tournament;
        
        require!(
            tournament.status == TournamentStatus::Registration,
            ErrorCode::RegistrationClosed
        );
        require!(
            tournament.current_players < tournament.max_players,
            ErrorCode::TournamentFull
        );

        let fee = tournament.entry_fee;

        if fee > 0 {
            if tournament.is_usdc {
                // Transfer USDC from player to tournament vault account
                let cpi_accounts = Transfer {
                    from: ctx.accounts.player_token_account.as_ref().unwrap().to_account_info(),
                    to: ctx.accounts.vault_token_account.as_ref().unwrap().to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.as_ref().unwrap().to_account_info();
                let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
                token::transfer(cpi_ctx, fee)?;
            } else {
                // Transfer SOL from player to tournament escrow vault PDA
                let cpi_context = CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.player.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                        amount: fee,
                    },
                );
                anchor_lang::system_program::transfer(cpi_context)?;
            }
        }

        // Store registration info
        let participant = &mut ctx.accounts.participant;
        participant.player = ctx.accounts.player.key();
        participant.tournament = tournament.key();
        participant.has_paid = true;
        participant.bump = ctx.bumps.participant;

        tournament.current_players += 1;

        Ok(())
    }

    /// End the tournament and disburse the total prize pool (entry fees + sponsored pool) to the winner.
    pub fn finalize_tournament(ctx: Context<FinalizeTournament>) -> Result<()> {
        let tournament = &mut ctx.accounts.tournament;
        
        require!(
            tournament.organizer == ctx.accounts.organizer.key(),
            ErrorCode::OnlyOrganizer
        );
        require!(
            tournament.status == TournamentStatus::Registration || tournament.status == TournamentStatus::Active,
            ErrorCode::InvalidStatus
        );

        tournament.status = TournamentStatus::Completed;
        tournament.winner = Some(ctx.accounts.winner.key());

        let tournament_id = tournament.tournament_id.clone();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"tournament",
            tournament_id.as_bytes(),
            &[tournament.bump],
        ]];

        if tournament.is_usdc {
            // Transfer entire vault USDC to winner
            let vault_balance = ctx.accounts.vault_token_account.as_ref().unwrap().amount;
            if vault_balance > 0 {
                let cpi_accounts = Transfer {
                    from: ctx.accounts.vault_token_account.as_ref().unwrap().to_account_info(),
                    to: ctx.accounts.winner_token_account.as_ref().unwrap().to_account_info(),
                    authority: tournament.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.as_ref().unwrap().to_account_info();
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
                token::transfer(cpi_ctx, vault_balance)?;
            }
        } else {
            // Transfer entire vault SOL balance to winner
            let vault_info = ctx.accounts.vault.to_account_info();
            let winner_info = ctx.accounts.winner.to_account_info();
            let vault_balance = vault_info.lamports();
            
            if vault_balance > 0 {
                **vault_info.try_borrow_mut_lamports()? -= vault_balance;
                **winner_info.try_borrow_mut_lamports()? += vault_balance;
            }
        }

        Ok(())
    }

    /// Cancel a tournament and allow player refunds.
    pub fn cancel_tournament(ctx: Context<CancelTournament>) -> Result<()> {
        let tournament = &mut ctx.accounts.tournament;
        
        require!(
            tournament.organizer == ctx.accounts.organizer.key(),
            ErrorCode::OnlyOrganizer
        );
        require!(
            tournament.status != TournamentStatus::Completed,
            ErrorCode::AlreadyCompleted
        );

        tournament.status = TournamentStatus::Cancelled;
        Ok(())
    }

    /// Claim refund for a player if the tournament was cancelled.
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let tournament = &ctx.accounts.tournament;
        let participant = &mut ctx.accounts.participant;

        require!(
            tournament.status == TournamentStatus::Cancelled,
            ErrorCode::TournamentNotCancelled
        );
        require!(participant.has_paid, ErrorCode::NoPaymentFound);

        participant.has_paid = false;
        let fee = tournament.entry_fee;

        let tournament_id = tournament.tournament_id.clone();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"tournament",
            tournament_id.as_bytes(),
            &[tournament.bump],
        ]];

        if fee > 0 {
            if tournament.is_usdc {
                let cpi_accounts = Transfer {
                    from: ctx.accounts.vault_token_account.as_ref().unwrap().to_account_info(),
                    to: ctx.accounts.player_token_account.as_ref().unwrap().to_account_info(),
                    authority: tournament.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.as_ref().unwrap().to_account_info();
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
                token::transfer(cpi_ctx, fee)?;
            } else {
                let vault_info = ctx.accounts.vault.to_account_info();
                let player_info = ctx.accounts.player.to_account_info();
                
                require!(vault_info.lamports() >= fee, ErrorCode::InsufficientEscrowBalance);
                
                **vault_info.try_borrow_mut_lamports()? -= fee;
                **player_info.try_borrow_mut_lamports()? += fee;
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(tournament_id: String)]
pub struct InitializeTournament<'info> {
    #[account(
        init,
        payer = organizer,
        space = 8 + 32 + 4 + tournament_id.len() + 8 + 4 + 8 + 1 + 1 + 33 + 1,
        seeds = [b"tournament", tournament_id.as_bytes()],
        bump
    )]
    pub tournament: Account<'info, TournamentState>,
    
    /// Check-free PDA to act as SOL Vault escrow
    #[account(
        mut,
        seeds = [b"vault", tournament_id.as_bytes()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub organizer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinTournament<'info> {
    #[account(
        mut,
        seeds = [b"tournament", tournament.tournament_id.as_bytes()],
        bump = tournament.bump
    )]
    pub tournament: Account<'info, TournamentState>,

    #[account(
        init,
        payer = player,
        space = 8 + 32 + 32 + 1 + 1,
        seeds = [b"participant", tournament.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, ParticipantState>,

    /// Check-free PDA for SOL Vault escrow
    #[account(
        mut,
        seeds = [b"vault", tournament.tournament_id.as_bytes()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    // Optional token accounts for USDC payments
    #[account(mut)]
    pub player_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_token_account: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct FinalizeTournament<'info> {
    #[account(
        mut,
        seeds = [b"tournament", tournament.tournament_id.as_bytes()],
        bump = tournament.bump
    )]
    pub tournament: Account<'info, TournamentState>,

    /// Check-free PDA for SOL Vault escrow
    #[account(
        mut,
        seeds = [b"vault", tournament.tournament_id.as_bytes()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    /// CHECK: The winner will receive the prize pool funds
    #[account(mut)]
    pub winner: AccountInfo<'info>,

    // Optional token accounts for USDC payouts
    #[account(mut)]
    pub vault_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub winner_token_account: Option<Account<'info, TokenAccount>>,
    
    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct CancelTournament<'info> {
    #[account(
        mut,
        seeds = [b"tournament", tournament.tournament_id.as_bytes()],
        bump = tournament.bump
    )]
    pub tournament: Account<'info, TournamentState>,

    #[account(mut)]
    pub organizer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(
        seeds = [b"tournament", tournament.tournament_id.as_bytes()],
        bump = tournament.bump
    )]
    pub tournament: Account<'info, TournamentState>,

    #[account(
        mut,
        seeds = [b"participant", tournament.key().as_ref(), player.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,

    /// Check-free PDA for SOL Vault escrow
    #[account(
        mut,
        seeds = [b"vault", tournament.tournament_id.as_bytes()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    // Optional token accounts for USDC refunds
    #[account(mut)]
    pub player_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[account]
pub struct TournamentState {
    pub organizer: Pubkey,
    pub tournament_id: String,
    pub entry_fee: u64,
    pub max_players: u32,
    pub base_prize_pool: u64,
    pub is_usdc: bool,
    pub current_players: u32,
    pub status: TournamentStatus,
    pub winner: Option<Pubkey>,
    pub bump: u8,
}

#[account]
pub struct ParticipantState {
    pub player: Pubkey,
    pub tournament: Pubkey,
    pub has_paid: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TournamentStatus {
    Registration,
    Active,
    Completed,
    Cancelled,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Only the organizer can execute this command.")]
    OnlyOrganizer,
    #[msg("Registration for this tournament is closed.")]
    RegistrationClosed,
    #[msg("The tournament is already full.")]
    TournamentFull,
    #[msg("The tournament status is invalid for this operation.")]
    InvalidStatus,
    #[msg("The tournament is already completed.")]
    AlreadyCompleted,
    #[msg("The tournament has not been cancelled.")]
    TournamentNotCancelled,
    #[msg("No entry fee payment was found for this player.")]
    NoPaymentFound,
    #[msg("Insufficient balance in the escrow vault.")]
    InsufficientEscrowBalance,
}
