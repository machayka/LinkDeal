use anchor_lang::prelude::*;
use anchor_lang::system_program;

// Adres programu. `anchor keys sync` wpisuje tu klucz z target/deploy/linkdeal-keypair.json.
declare_id!("AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S");

#[program]
pub mod linkdeal {
    use super::*;

    // Wykonawca tworzy umowę: zapisuje warunki w nowym koncie (PDA).
    // Pieniędzy jeszcze nie ma — wpłaci je zleceniodawca w `fund`.
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        _nonce: u64, // tylko do adresu PDA, żeby wykonawca mógł mieć wiele umów
        amount: u64, // kwota zlecenia w lamportach (1 SOL = 1_000_000_000)
        tasks: Vec<Task>,
        deadline: i64,         // unix timestamp (sekundy)
        offer_expires_at: i64, // do kiedy zleceniodawca może wpłacić
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, LinkDealError::ZeroAmount);
        require!(
            now < offer_expires_at && offer_expires_at <= deadline,
            LinkDealError::BadDates
        );
        validate_tasks(&tasks)?;

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

    // Zleceniodawca przyjmuje ofertę: wpłaca 100% kwoty do konta umowy.
    // Kto wpłaci — ten zostaje zleceniodawcą.
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

    // Zleceniodawca zalicza kolejny task → program wypłaca jego % wykonawcy.
    // Ostatni task: wykonawca dostaje całą resztę + rent, konto umowy znika.
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
        let payout = task_payout(escrow.amount, escrow.tasks[index].percent);
        ctx.accounts.escrow.sub_lamports(payout)?;
        ctx.accounts.freelancer.add_lamports(payout)?;
        ctx.accounts.escrow.approved += 1;
        Ok(())
    }

    // Nikt nie wpłacił, a oferta wygasła → zamykamy konto, rent wraca do wykonawcy.
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

// Kwota za jeden task. u128, żeby mnożenie nie przepełniło u64.
pub fn task_payout(amount: u64, percent: u8) -> u64 {
    (amount as u128 * percent as u128 / 100) as u64
}

// Reguły tasków w osobnej funkcji, żeby dało się je przetestować bez blockchaina.
pub fn validate_tasks(tasks: &[Task]) -> Result<()> {
    require!(
        (1..=MAX_TASKS).contains(&tasks.len()),
        LinkDealError::BadTaskCount
    );
    let mut sum: u32 = 0;
    for task in tasks {
        require!(task.percent >= 5, LinkDealError::TaskTooSmall);
        require!(
            !task.description.is_empty() && task.description.len() <= MAX_DESCRIPTION,
            LinkDealError::BadDescription
        );
        sum += task.percent as u32;
    }
    require!(sum == 100, LinkDealError::PercentSumNot100);
    Ok(())
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
    // Tylko ten, kto wpłacił (client), może zaliczać taski.
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
    pub client: Option<Pubkey>, // None = jeszcze nikt nie wpłacił
    pub amount: u64,
    #[max_len(MAX_TASKS)]
    pub tasks: Vec<Task>,
    pub approved: u8, // ile tasków zaliczono (po kolei)
    pub deadline: i64,
    pub offer_expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Task {
    #[max_len(MAX_DESCRIPTION)]
    pub description: String,
    pub percent: u8, // % kwoty zlecenia
}

#[error_code]
pub enum LinkDealError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Offer must expire in the future and not after the deadline")]
    BadDates,
    #[msg("Contract must have 1 to 10 tasks")]
    BadTaskCount,
    #[msg("Each task must be at least 5%")]
    TaskTooSmall,
    #[msg("Task description must be 1 to 100 bytes")]
    BadDescription,
    #[msg("Task percentages must sum to 100")]
    PercentSumNot100,
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

    fn task(percent: u8) -> Task {
        Task { description: "Logo design".into(), percent }
    }

    #[test]
    fn valid_tasks() {
        assert!(validate_tasks(&[task(30), task(30), task(40)]).is_ok());
        assert!(validate_tasks(&[task(100)]).is_ok());
    }

    #[test]
    fn sum_not_100() {
        assert!(validate_tasks(&[task(50), task(40)]).is_err());
        assert!(validate_tasks(&[task(60), task(50)]).is_err());
    }

    #[test]
    fn task_below_5_percent() {
        assert!(validate_tasks(&[task(4), task(96)]).is_err());
    }

    #[test]
    fn bad_task_count() {
        assert!(validate_tasks(&[]).is_err());
        assert!(validate_tasks(&vec![task(5); 11]).is_err()); // 11 tasków — za dużo
        assert!(validate_tasks(&vec![task(10); 10]).is_ok()); // 10 tasków — maksimum
    }

    #[test]
    fn payout_is_percent_of_amount() {
        assert_eq!(task_payout(3_000_000_000, 33), 990_000_000);
        assert_eq!(task_payout(100, 5), 5);
        assert_eq!(task_payout(10, 33), 3); // zaokrąglenie w dół — resztę dostanie ostatni task
        assert_eq!(task_payout(u64::MAX, 100), u64::MAX); // brak przepełnienia
    }

    #[test]
    fn bad_description() {
        let empty = Task { description: "".into(), percent: 100 };
        let too_long = Task { description: "a".repeat(101), percent: 100 };
        assert!(validate_tasks(&[empty]).is_err());
        assert!(validate_tasks(&[too_long]).is_err());
    }
}
