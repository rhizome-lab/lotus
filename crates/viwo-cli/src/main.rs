//! Viwo CLI entry point.

use std::io::Read;

use clap::{Parser, Subcommand};
use tracing::info;
use tracing_subscriber::EnvFilter;
use viwo_runtime_luajit::compile;
use viwo_syntax_typescript::transpile;
use viwo_transport_websocket_jsonrpc::{Server, ServerConfig};

#[derive(Parser)]
#[command(name = "viwo")]
#[command(about = "Viwo runtime CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the server
    Serve {
        /// Host to bind to
        #[arg(short = 'H', long, default_value = "127.0.0.1")]
        host: String,

        /// Port to listen on
        #[arg(short, long, default_value = "8080")]
        port: u16,

        /// Database file path
        #[arg(short, long, default_value = "world.sqlite")]
        db: String,

        /// Plugin directory
        #[arg(long)]
        plugins: Option<String>,
    },

    /// Transpile TypeScript to S-expressions
    Transpile {
        /// Input file(s)
        #[arg(required = true)]
        files: Vec<String>,

        /// Output directory
        #[arg(short, long)]
        out: Option<String>,
    },

    /// Compile S-expressions to Lua
    Compile {
        /// Input S-expression file (or - for stdin)
        file: String,

        /// Write to stdout instead of file
        #[arg(long)]
        stdout: bool,
    },

    /// Execute an S-expression file
    Exec {
        /// Input S-expression file (or - for stdin)
        file: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("viwo=info".parse()?))
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Serve {
            host,
            port,
            db,
            plugins,
        } => {
            info!("Starting Viwo server");

            if let Some(ref plugin_dir) = plugins {
                info!("Plugin directory: {}", plugin_dir);
            }

            let config = ServerConfig {
                host,
                port,
                db_path: db,
            };

            let server = Server::new(config)?;
            server.run().await?;
        }

        Commands::Transpile { files, out } => {
            for file in files {
                let source = std::fs::read_to_string(&file)?;
                let sexpr = transpile(&source)?;
                let json = serde_json::to_string_pretty(&sexpr)?;

                let out_path = if let Some(ref output_dir) = out {
                    let filename = std::path::Path::new(&file)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy();
                    format!("{}/{}.json", output_dir, filename)
                } else {
                    file.replace(".ts", ".json").replace(".tsx", ".json")
                };

                std::fs::write(&out_path, &json)?;
                println!("{} -> {}", file, out_path);
            }
        }

        Commands::Compile { file, stdout } => {
            let input = if file == "-" {
                let mut buf = String::new();
                std::io::stdin().read_to_string(&mut buf)?;
                buf
            } else {
                std::fs::read_to_string(&file)?
            };

            let sexpr: viwo_ir::SExpr = serde_json::from_str(&input)?;
            let lua_code = compile(&sexpr)?;

            if stdout {
                println!("{}", lua_code);
            } else {
                let out_path = if file == "-" {
                    "output.lua".to_string()
                } else {
                    file.replace(".json", ".lua")
                };
                std::fs::write(&out_path, &lua_code)?;
                println!("Wrote: {}", out_path);
            }
        }

        Commands::Exec { file } => {
            let input = if file == "-" {
                let mut buf = String::new();
                std::io::stdin().read_to_string(&mut buf)?;
                buf
            } else {
                std::fs::read_to_string(&file)?
            };

            let sexpr: viwo_ir::SExpr = serde_json::from_str(&input)?;
            let result = viwo_runtime_luajit::execute(&sexpr)?;

            println!("{}", serde_json::to_string_pretty(&result)?);
        }
    }

    Ok(())
}
