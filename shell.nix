#with import (builtins.fetchTarball "https://nixos.org/channels/nixpkgs-unstable/nixexprs.tar.xz") {};
with (import <nixpkgs> {});
let 
  pnpmPkg = nodePackages_8_x.pnpm;
  # npm ERR! Unsupported URL Type "link:": link:../../privatePackages/assert-project
  pnpm = (pnpmPkg.override (old: {
      preRebuild = ''
        sed -i 's|link:|file:|' package.json
      '';
  }));
in mkShell {
  buildInputs = [
    nodejs-8_x
    pnpm
    solc
  ];

  shellHook = ''
    export PATH=$PATH:$(pwd)/node_modules/.bin
  '';
}
