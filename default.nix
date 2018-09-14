{ pkgs ? (import <nixpkgs> {})
, pnpm2nix ? ((import ./pnpm2nix) { inherit pkgs; })
}:

pnpm2nix.mkPnpmPackage {
  src = pkgs.lib.cleanSource ./.;
  allowImpure = true;
  packageJSON = ./package.json;
  shrinkwrapYML = ./shrinkwrap.yaml;
}
