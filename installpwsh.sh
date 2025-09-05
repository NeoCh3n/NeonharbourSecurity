#!/usr/bin/env bash
set -euo pipefail

arch="$(dpkg --print-architecture)"
echo "[*] Detected arch: $arch"

# Common deps
sudo apt update
sudo apt install -y curl ca-certificates apt-transport-https gnupg

if [[ "$arch" == "amd64" ]]; then
  echo "[*] Installing PowerShell via Microsoft apt repo (amd64)…"
  tmpdeb="$(mktemp)"
  curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o "$tmpdeb"
  sudo dpkg -i "$tmpdeb"
  rm -f "$tmpdeb"
  sudo apt update
  sudo apt install -y powershell
  echo "[✓] Done. Run with: pwsh"
  exit 0
fi

if [[ "$arch" == "arm64" ]]; then
  echo "[*] Installing PowerShell tarball for ARM64…"

  # Try to get latest linux-arm64 tarball URL from GitHub
  echo "[*] Fetching latest release info from GitHub…"
  url="$(curl -fsSL https://api.github.com/repos/PowerShell/PowerShell/releases/latest \
        | grep -oE 'https://[^"]+powershell-[0-9.]+-linux-arm64\.tar\.gz' \
        | head -n1 || true)"

  if [[ -z "${url:-}" ]]; then
    echo "[!] Failed to auto-detect latest URL."
    echo "    Please manually set POWERSHELL_URL to a linux-arm64 tar.gz and rerun:"
    echo "    POWERSHELL_URL=https://github.com/PowerShell/PowerShell/releases/download/vX.Y.Z/powershell-X.Y.Z-linux-arm64.tar.gz ./install-pwsh.sh"
    exit 1
  fi

  file="$(basename "$url")"
  ver="$(echo "$file" | sed -E 's/powershell-([0-9.]+)-linux-arm64\.tar\.gz/\1/')"
  dest="/opt/microsoft/powershell/$ver"

  echo "[*] Downloading: $url"
  curl -fL "$url" -o "/tmp/$file"

  echo "[*] Creating destination: $dest"
  sudo mkdir -p "$dest"

  echo "[*] Extracting…"
  sudo tar -xzf "/tmp/$file" -C "$dest"

  echo "[*] Ensuring convenience symlink /usr/local/bin/pwsh …"
  sudo ln -sf "$dest/pwsh" /usr/local/bin/pwsh

  # Helpful (usually already present)
  sudo apt install -y libc6 libgcc-s1 libstdc++6 libicu-dev || true

  echo "[✓] Installed PowerShell $ver for ARM64."
  echo "    Start it with: pwsh"
  exit 0
fi

echo "[!] Unsupported architecture: $arch"
exit 2