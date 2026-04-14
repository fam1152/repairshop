#!/usr/bin/env bash
# ============================================================
#  RepairShop RPM Builder
#  Run this on Fedora to build the installable .rpm package
#
#  Usage:
#    chmod +x build-rpm.sh
#    ./build-rpm.sh
#
#  Output:
#    ~/rpmbuild/RPMS/x86_64/repairshop-9.0-1.fc*.x86_64.rpm
# ============================================================
set -euo pipefail

VERSION="9.0"
RELEASE="1"
NAME="repairshop"
TARNAME="${NAME}-${VERSION}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   RepairShop v${VERSION} RPM Builder           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Check we're on Fedora / RHEL ──────────────────────────
if ! command -v rpm &>/dev/null; then
    error "This script must be run on Fedora/RHEL. rpm not found."
fi

# ── Check for required tools ──────────────────────────────
info "Checking build dependencies…"

MISSING=()
for cmd in node npm rpmbuild openssl; do
    command -v "$cmd" &>/dev/null || MISSING+=("$cmd")
done

if [ ${#MISSING[@]} -gt 0 ]; then
    warn "Missing tools: ${MISSING[*]}"
    info "Installing missing build dependencies…"
    sudo dnf install -y \
        nodejs npm \
        rpm-build rpmdevtools \
        openssl \
        2>/dev/null || error "Failed to install dependencies. Run: sudo dnf install nodejs npm rpm-build rpmdevtools openssl"
fi

# Check node version
NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
    error "Node.js 20+ required. Current: $(node --version). Run: sudo dnf install nodejs"
fi

success "All build dependencies present (Node.js $(node --version))"

# ── Set up rpmbuild tree ──────────────────────────────────
info "Setting up rpmbuild directory tree…"
rpmdev-setuptree 2>/dev/null || mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(mktemp -d /tmp/repairshop-build-XXXX)"
trap "rm -rf $BUILD_DIR" EXIT

info "Build dir: $BUILD_DIR"

# ── Copy source files ─────────────────────────────────────
info "Copying source files…"
SRCDIR="$BUILD_DIR/$TARNAME"
mkdir -p "$SRCDIR"

cp -r "$SCRIPT_DIR/server"       "$SRCDIR/"
cp -r "$SCRIPT_DIR/client"       "$SRCDIR/"
cp -r "$SCRIPT_DIR/rpm"          "$SRCDIR/"
cp    "$SCRIPT_DIR/package.json" "$SRCDIR/"
cp    "$SCRIPT_DIR/LICENSE"      "$SRCDIR/"
cp    "$SCRIPT_DIR/README.md"    "$SRCDIR/" 2>/dev/null || true

# Remove dev artifacts
rm -rf "$SRCDIR/client/node_modules"
rm -rf "$SRCDIR/client/build"
rm -rf "$SRCDIR/node_modules"
find "$SRCDIR" -name ".DS_Store" -delete 2>/dev/null || true

# ── Create source tarball ─────────────────────────────────
info "Creating source tarball…"
TARBALL="$HOME/rpmbuild/SOURCES/${TARNAME}.tar.gz"
tar -czf "$TARBALL" -C "$BUILD_DIR" "$TARNAME"
success "Tarball: $TARBALL"

# ── Copy spec file ────────────────────────────────────────
info "Copying spec file…"
cp "$SCRIPT_DIR/rpm/SPECS/repairshop.spec" ~/rpmbuild/SPECS/

# ── Build the RPM ─────────────────────────────────────────
echo ""
info "Building RPM (this will take 3–5 minutes — React build takes time)…"
echo ""

rpmbuild -bb ~/rpmbuild/SPECS/repairshop.spec \
    --define "_topdir $HOME/rpmbuild" \
    2>&1 | while IFS= read -r line; do
        if echo "$line" | grep -q "error:"; then
            echo -e "${RED}$line${NC}"
        elif echo "$line" | grep -q "warning:"; then
            echo -e "${YELLOW}$line${NC}"
        elif echo "$line" | grep -q "Wrote:"; then
            echo -e "${GREEN}$line${NC}"
        else
            echo "  $line"
        fi
    done

# ── Find output RPM ───────────────────────────────────────
RPM_FILE=$(find ~/rpmbuild/RPMS -name "${NAME}-${VERSION}*.rpm" | head -1)

if [ -z "$RPM_FILE" ]; then
    error "RPM build failed — no output file found. Check output above."
fi

RPM_SIZE=$(du -sh "$RPM_FILE" | cut -f1)

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Build successful!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}RPM:${NC}  $RPM_FILE"
echo -e "  ${GREEN}Size:${NC} $RPM_SIZE"
echo ""
echo -e "${BLUE}── Install ─────────────────────────────────────────────${NC}"
echo -e "  sudo dnf install $RPM_FILE"
echo ""
echo -e "${BLUE}── Or copy to another Fedora machine and install ───────${NC}"
echo -e "  scp $RPM_FILE user@server:~/"
echo -e "  sudo dnf install ~/$(basename $RPM_FILE)"
echo ""
echo -e "${BLUE}── After install ───────────────────────────────────────${NC}"
echo -e "  1. Edit config:   sudo nano /etc/repairshop/repairshop.conf"
echo -e "     ${YELLOW}Set JWT_SECRET to a random string!${NC}"
echo -e "  2. Also update:   sudo nano /etc/sysconfig/repairshop"
echo -e "     ${YELLOW}(Copy same values — systemd reads this file)${NC}"
echo -e "  3. Start:         sudo systemctl enable --now repairshop"
echo -e "  4. Open:          http://localhost:3000"
echo -e "  5. Camera HTTPS:  https://localhost:3443"
echo ""
