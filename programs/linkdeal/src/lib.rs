use anchor_lang::prelude::*;

// Adres programu. `anchor keys sync` wpisuje tu klucz z target/deploy/linkdeal-keypair.json.
declare_id!("AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S");

#[program]
pub mod linkdeal {
    use super::*;

    // Tymczasowa instrukcja — sprawdza tylko, że program działa. Usuniemy ją w kroku 2.
    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        msg!("pong");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping {}
