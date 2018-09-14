with import <nixpkgs> {};
with (import ./pnpm2nix) { inherit pkgs; };

mkPnpmPackage {
  src = lib.cleanSource ./.;
  allowImpure = true;
  packageJSON = ./package.json;
  shrinkwrapYML = ./shrinkwrap.yaml;
}
