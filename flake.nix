{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };
  outputs =
    { self, nixpkgs }:
    let
      forAllSystems =
        with nixpkgs.lib;
        f: foldAttrs mergeAttrs { } (map (s: { ${s} = f s; }) systems.flakeExposed);
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          # Default: TypeScript + Rust development
          default = pkgs.mkShell rec {
            buildInputs = with pkgs; [
              # TypeScript
              bun
              nodePackages.typescript
              nodePackages.typescript-language-server
              psmisc # for fuser
              ripgrep
              stdenv.cc.cc # runtime libs (libstdc++ for sharp/vips)
              # Rust toolchain
              rustc
              cargo
              rust-analyzer
              clippy
              rustfmt
              # Fast linker
              mold
              clang
              # SQLite (for rusqlite)
              sqlite
              # OpenSSL (for reqwest/net plugin)
              openssl
              pkg-config
            ];
            LD_LIBRARY_PATH = "${pkgs.lib.makeLibraryPath buildInputs}:$LD_LIBRARY_PATH";
          };

          # Full: TypeScript + Rust + Python for diffusers server
          full = pkgs.mkShell rec {
            buildInputs = with pkgs; [
              # TypeScript
              bun
              nodePackages.typescript
              nodePackages.typescript-language-server
              psmisc
              ripgrep
              stdenv.cc.cc # runtime libs (libstdc++ for sharp/vips)
              # Rust toolchain
              rustc
              cargo
              rust-analyzer
              clippy
              rustfmt
              mold
              clang
              sqlite
              # OpenSSL (for reqwest/net plugin)
              openssl
              pkg-config
              # Python for diffusers server
              python313
              uv
              ruff
            ];
            LD_LIBRARY_PATH = "${pkgs.lib.makeLibraryPath buildInputs}:$LD_LIBRARY_PATH";
          };
        }
      );
    };
}
