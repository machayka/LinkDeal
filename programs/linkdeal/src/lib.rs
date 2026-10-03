use anchor_lang::prelude::*;

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
    fn bad_description() {
        let empty = Task { description: "".into(), percent: 100 };
        let too_long = Task { description: "a".repeat(101), percent: 100 };
        assert!(validate_tasks(&[empty]).is_err());
        assert!(validate_tasks(&[too_long]).is_err());
    }
}
