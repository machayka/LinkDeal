use anchor_lang::prelude::*;
use anchor_lang::system_program;

// Adres programu. `anchor keys sync` wpisuje tu klucz z target/deploy/linkdeal-keypair.json.
declare_id!("AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S");

#[program]
pub mod linkdeal {
    use super::*;

    // Wykonawca tworzy ofertę: zapisuje warunki w nowym koncie (PDA).
    // Pieniędzy jeszcze nie ma — zleceniodawca wpłaci je, przyjmując ofertę (`fund`).
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        _nonce: u64, // tylko do adresu PDA, żeby wykonawca mógł mieć wiele umów
        tasks: Vec<Task>,
        deadline: i64,         // unix timestamp (sekundy)
        offer_expires_at: i64, // do kiedy zleceniodawca może przyjąć ofertę
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now < offer_expires_at && offer_expires_at <= deadline,
            LinkDealError::BadDates
        );
        let amount = validate_tasks(&tasks)?; // kwota zlecenia = suma milestone'ów

        ctx.accounts.escrow.set_inner(Escrow {
            freelancer: ctx.accounts.freelancer.key(),
            client: None,
            amount,
            tasks,
            approved: 0,
            deadline,
            offer_expires_at,
        });
        Ok(())
    }

    // Zleceniodawca przyjmuje ofertę: przelewa całą kwotę zlecenia na konto umowy (zostaje tam zamrożona).
    // Kto przyjmie ofertę — ten zostaje zleceniodawcą.
    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.client.is_none(), LinkDealError::AlreadyFunded);
        require!(
            Clock::get()?.unix_timestamp < escrow.offer_expires_at,
            LinkDealError::OfferExpired
        );

        // Przelew SOL z portfela zleceniodawcy na konto umowy (przez System Program).
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            escrow.amount,
        )?;

        ctx.accounts.escrow.client = Some(ctx.accounts.client.key());
        Ok(())
    }

    // Zleceniodawca zalicza kolejny milestone → program wypłaca jego kwotę wykonawcy.
    // Ostatni milestone: wykonawca dostaje całą resztę + rent, konto umowy znika.
    pub fn approve_milestone(ctx: Context<ApproveMilestone>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            Clock::get()?.unix_timestamp < escrow.deadline,
            LinkDealError::DeadlinePassed
        );

        let index = escrow.approved as usize;
        if index + 1 == escrow.tasks.len() {
            // close() przelewa wszystkie lamporty konta wykonawcy i zamyka konto.
            return ctx.accounts.escrow.close(ctx.accounts.freelancer.to_account_info());
        }

        // Konto umowy należy do programu, więc program sam zmienia jego saldo — bez CPI.
        let payout = escrow.tasks[index].amount;
        ctx.accounts.escrow.sub_lamports(payout)?;
        ctx.accounts.freelancer.add_lamports(payout)?;
        ctx.accounts.escrow.approved += 1;
        Ok(())
    }

    // Oferta wygasła i nie została przyjęta → zamykamy konto, rent wraca do wykonawcy.
    // Może wywołać każdy. Zamknięcie robi Anchor (`close = freelancer` w Cancel).
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.client.is_none(), LinkDealError::AlreadyFunded);
        require!(
            Clock::get()?.unix_timestamp >= escrow.offer_expires_at,
            LinkDealError::OfferStillValid
        );
        Ok(())
    }

    // Deadline minął → niewypłacona reszta wraca do zleceniodawcy, rent do wykonawcy.
    // Może wywołać każdy. Zamknięcie robi Anchor (`close = freelancer` w RefundAfterDeadline).
    pub fn refund_after_deadline(ctx: Context<RefundAfterDeadline>) -> Result<()> {
        require!(
            Clock::get()?.unix_timestamp >= ctx.accounts.escrow.deadline,
            LinkDealError::DeadlineNotPassed
        );

        // Reszta = wszystko na koncie poza rentem (rent jest potrzebny, by konto istniało).
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let rent = Rent::get()?.minimum_balance(escrow_info.data_len());
        let rest = escrow_info.lamports() - rent;

        ctx.accounts.escrow.sub_lamports(rest)?;
        ctx.accounts.client.add_lamports(rest)?;
        Ok(())
    }
}

// Reguły milestone'ów w osobnej funkcji, żeby dało się je przetestować bez blockchaina.
// Zwraca kwotę zlecenia, czyli sumę kwot milestone'ów.
pub fn validate_tasks(tasks: &[Task]) -> Result<u64> {
    require!(
        (1..=MAX_TASKS).contains(&tasks.len()),
        LinkDealError::BadTaskCount
    );
    let mut sum: u64 = 0;
    for task in tasks {
        require!(task.amount > 0, LinkDealError::ZeroAmount);
        require!(
            !task.description.is_empty() && task.description.len() <= MAX_DESCRIPTION,
            LinkDealError::BadDescription
        );
        sum = sum.checked_add(task.amount).ok_or(LinkDealError::AmountTooLarge)?;
    }
    Ok(sum)
}

const MAX_TASKS: usize = 10;
const MAX_DESCRIPTION: usize = 100; // w bajtach; polskie litery zajmują po 2

// Konta potrzebne do `create_escrow`.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateEscrow<'info> {
    #[account(mut)] // mut, bo płaci za utworzenie konta (rent)
    pub freelancer: Signer<'info>,

    // Nowe konto umowy. Adres wyliczany z seedów — ten sam adres trafia do linku.
    #[account(
        init,
        payer = freelancer,
        space = Escrow::DISCRIMINATOR.len() + Escrow::INIT_SPACE,
        seeds = [b"escrow", freelancer.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut)] // mut, bo z tego portfela schodzą SOL
    pub client: Signer<'info>,

    // Anchor sprawdza, że to konto należy do naszego programu i jest typu Escrow.
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    // Tylko ten, kto przyjął ofertę (client), może zaliczać milestone'y.
    pub client: Signer<'info>,

    // mut, bo dostaje wypłatę. Nie musi podpisywać — pieniądze tylko przychodzą.
    #[account(mut)]
    pub freelancer: SystemAccount<'info>,

    // has_one = freelancer: przekazany wykonawca musi być tym z umowy.
    #[account(
        mut,
        has_one = freelancer,
        constraint = escrow.client == Some(client.key()) @ LinkDealError::NotClient
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)] // dostaje rent
    pub freelancer: SystemAccount<'info>,

    // close = freelancer: po udanej instrukcji Anchor zamyka konto i oddaje lamporty wykonawcy.
    #[account(mut, has_one = freelancer, close = freelancer)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct RefundAfterDeadline<'info> {
    #[account(mut)] // dostaje resztę kwoty
    pub client: SystemAccount<'info>,

    #[account(mut)] // dostaje rent
    pub freelancer: SystemAccount<'info>,

    #[account(
        mut,
        has_one = freelancer,
        constraint = escrow.client == Some(client.key()) @ LinkDealError::NotClient,
        close = freelancer
    )]
    pub escrow: Account<'info, Escrow>,
}

// Dane umowy zapisane na blockchainie.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub freelancer: Pubkey,
    pub client: Option<Pubkey>, // None = oferta jeszcze nieprzyjęta
    pub amount: u64, // kwota zlecenia = suma milestone'ów
    #[max_len(MAX_TASKS)]
    pub tasks: Vec<Task>,
    pub approved: u8, // ile milestone'ów zaliczono (po kolei)
    pub deadline: i64,
    pub offer_expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Task {
    #[max_len(MAX_DESCRIPTION)]
    pub description: String,
    pub amount: u64, // kwota milestone'u w lamportach (1 SOL = 1_000_000_000)
}

#[error_code]
pub enum LinkDealError {
    #[msg("Milestone amount must be greater than zero")]
    ZeroAmount,
    #[msg("Total amount is too large")]
    AmountTooLarge,
    #[msg("Offer must expire in the future and not after the deadline")]
    BadDates,
    #[msg("Contract must have 1 to 10 milestones")]
    BadTaskCount,
    #[msg("Milestone description must be 1 to 100 bytes")]
    BadDescription,
    #[msg("Contract is already funded")]
    AlreadyFunded,
    #[msg("Offer has expired")]
    OfferExpired,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Only the client who funded the contract can do this")]
    NotClient,
    #[msg("Offer is still valid")]
    OfferStillValid,
    #[msg("Deadline has not passed yet")]
    DeadlineNotPassed,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(amount: u64) -> Task {
        Task { description: "Logo design".into(), amount }
    }

    #[test]
    fn total_is_sum_of_milestones() {
        assert_eq!(validate_tasks(&[task(100), task(250), task(650)]).unwrap(), 1000);
        assert_eq!(validate_tasks(&[task(1)]).unwrap(), 1);
    }

    #[test]
    fn zero_amount() {
        assert!(validate_tasks(&[task(100), task(0)]).is_err());
    }

    #[test]
    fn total_overflow() {
        assert!(validate_tasks(&[task(u64::MAX), task(1)]).is_err());
    }

    #[test]
    fn bad_task_count() {
        assert!(validate_tasks(&[]).is_err());
        assert!(validate_tasks(&vec![task(1); 11]).is_err()); // 11 milestone'ów — za dużo
        assert!(validate_tasks(&vec![task(1); 10]).is_ok()); // 10 — maksimum
    }

    #[test]
    fn bad_description() {
        let empty = Task { description: "".into(), amount: 100 };
        let too_long = Task { description: "a".repeat(101), amount: 100 };
        assert!(validate_tasks(&[empty]).is_err());
        assert!(validate_tasks(&[too_long]).is_err());
    }
}
