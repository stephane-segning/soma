use clap::{Parser, Subcommand};
use soma_net::{default_identity_path, generate_identity};

#[derive(Debug, Parser)]
#[command(name = "soma-daemon", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the daemon identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

fn main() {
    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("daemon"));
        let id = generate_identity(&path).expect("generate identity");
        println!(
            "generated daemon identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return;
    }

    println!("soma-daemon starting (desktop peer/daemon; Unix socket IPC; no Axum)");
}
