{
  appimageTools,
  fetchurl,
  lib,
  release ? import ./release.nix,
  stdenv,
}:

let
  pname = "magies-terminal";
  inherit (release) sources version;

  source =
    sources.${stdenv.hostPlatform.system}
      or (throw "MagiesTerminal AppImage packages are available for x86_64-linux and aarch64-linux only.");

  src = fetchurl {
    url = "https://github.com/JasonZhangDad/MgTerminal-releases/releases/download/v${version}/MagiesTerminal-${version}-linux-${source.appImageArch}.AppImage";
    inherit (source) hash;
  };

  appimageContents = appimageTools.extractType2 {
    inherit pname version src;
  };
in
appimageTools.wrapType2 {
  inherit pname version src;

  extraInstallCommands = ''
    desktopSource="$(find ${appimageContents} -maxdepth 3 -name '*.desktop' -print -quit)"
    if [ -n "$desktopSource" ]; then
      desktopFile="$out/share/applications/magies-terminal.desktop"
      install -Dm444 "$desktopSource" "$desktopFile"
      substituteInPlace "$desktopFile" \
        --replace "Exec=AppRun" "Exec=magies-terminal" \
        --replace "Exec=MagiesTerminal" "Exec=magies-terminal"
    fi

    if [ -d "${appimageContents}/usr/share/icons" ]; then
      mkdir -p "$out/share"
      cp -r "${appimageContents}/usr/share/icons" "$out/share/"
    fi
  '';

  meta = {
    description = "Modern SSH client and terminal manager";
    homepage = "https://shell.magies.top";
    license = lib.licenses.gpl3Plus;
    mainProgram = "magies-terminal";
    platforms = builtins.attrNames sources;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
