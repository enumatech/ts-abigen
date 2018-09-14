#with import (builtins.fetchTarball "https://nixos.org/channels/nixpkgs-unstable/nixexprs.tar.xz") {};
with (import <nixpkgs> {});

mkShell {

  buildInputs = [
    nodejs-8_x
    nodePackages_8_x.pnpm
    solc
  ];

  shellHook = ''
    export PATH=$PATH:$(pwd)/node_modules/.bin
  '';
}
