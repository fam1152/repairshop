Name:           repairshop
Version:        10.0
Release:        1%{?dist}
Summary:        IT Repair Shop Management System
License:        Proprietary
URL:            https://github.com/fam1152/repairshop
Source0:        repairshop-%{version}.tar.gz

# Runtime requirements
Requires:       nodejs >= 20
Requires:       npm >= 10
Requires(pre):  shadow-utils
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd

BuildRequires:  nodejs >= 20
BuildRequires:  npm >= 10

%description
RepairShop is a self-hosted IT repair shop management system with customer
management, repair tickets, invoicing, inventory tracking, appointments,
AI diagnostics via Ollama, and financial reporting.

Built by fam1152. Licensed for internal use only.

# ── Don't strip binaries (node native modules break if stripped)
%global __os_install_post %(echo '%{__os_install_post}' | sed -e 's!/usr/lib[^[:space:]]*/brp-python-bytecompile[[:space:]].*$!!g')
%define __strip /bin/true
%define _build_id_links none
%define debug_package %{nil}

%prep
%setup -q

%build
# Install server dependencies
npm install --production --no-optional

# Build React frontend
cd client
npm install
npm run build
cd ..

%install
# Create directory structure
install -d %{buildroot}/opt/repairshop
install -d %{buildroot}/opt/repairshop/server
install -d %{buildroot}/opt/repairshop/client/build
install -d %{buildroot}/opt/repairshop/node_modules
install -d %{buildroot}/var/lib/repairshop
install -d %{buildroot}/var/lib/repairshop/uploads
install -d %{buildroot}/var/lib/repairshop/uploads/avatars
install -d %{buildroot}/var/lib/repairshop/uploads/photos
install -d %{buildroot}/var/log/repairshop
install -d %{buildroot}/etc/repairshop
install -d %{buildroot}%{_unitdir}
install -d %{buildroot}%{_sysconfdir}/sysconfig

# Copy application files
cp -r server/          %{buildroot}/opt/repairshop/server/
cp -r node_modules/    %{buildroot}/opt/repairshop/node_modules/
cp -r client/build/    %{buildroot}/opt/repairshop/client/build/
install -m 0644 package.json   %{buildroot}/opt/repairshop/package.json
install -m 0644 LICENSE        %{buildroot}/opt/repairshop/LICENSE

# Config file
install -m 0640 rpm/config/repairshop.conf %{buildroot}/etc/repairshop/repairshop.conf

# Sysconfig (environment for systemd)
install -m 0640 rpm/config/repairshop.sysconfig %{buildroot}%{_sysconfdir}/sysconfig/repairshop

# Systemd service
install -m 0644 rpm/systemd/repairshop.service %{buildroot}%{_unitdir}/repairshop.service

%pre
# Create repairshop system user if it doesn't exist
getent group repairshop >/dev/null || groupadd -r repairshop
getent passwd repairshop >/dev/null || \
    useradd -r -g repairshop -d /var/lib/repairshop -s /sbin/nologin \
    -c "RepairShop service account" repairshop
exit 0

%post
# Reload systemd and enable service
%systemd_post repairshop.service
systemctl daemon-reload >/dev/null 2>&1 || true

# Generate SSL cert if it doesn't exist
SSL_DIR=/var/lib/repairshop/ssl
if [ ! -f "$SSL_DIR/cert.pem" ]; then
    mkdir -p "$SSL_DIR"
    HOST_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
    openssl req -x509 -newkey rsa:4096 \
        -keyout "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -days 3650 -nodes \
        -subj "/CN=$HOST_IP" \
        >/dev/null 2>&1 || true
    chown -R repairshop:repairshop "$SSL_DIR"
    chmod 700 "$SSL_DIR"
    chmod 600 "$SSL_DIR"/*.pem 2>/dev/null || true
fi

# Fix ownership
chown -R repairshop:repairshop /var/lib/repairshop
chown -R repairshop:repairshop /var/log/repairshop
chown -R root:repairshop /etc/repairshop
chmod 750 /etc/repairshop

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           RepairShop v9.0 installed!                 ║"
echo "║                                                      ║"
echo "║  Start:    sudo systemctl start repairshop           ║"
echo "║  Enable:   sudo systemctl enable repairshop          ║"
echo "║  Status:   sudo systemctl status repairshop          ║"
echo "║  Logs:     sudo journalctl -u repairshop -f          ║"
echo "║                                                      ║"
echo "║  HTTP:     http://localhost:3000                     ║"
echo "║  HTTPS:    https://localhost:3443  (for camera)      ║"
echo "║  Data:     /var/lib/repairshop/                      ║"
echo "║  Config:   /etc/repairshop/repairshop.conf           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

%preun
%systemd_preun repairshop.service

%postun
%systemd_postun_with_restart repairshop.service

# Remove user/group only on full uninstall (not upgrade)
if [ $1 -eq 0 ]; then
    getent passwd repairshop >/dev/null && userdel repairshop || true
    getent group repairshop >/dev/null && groupdel repairshop || true
fi

%files
%defattr(-,root,root,-)
%license /opt/repairshop/LICENSE

# Application files (owned by root, readable by repairshop)
%dir /opt/repairshop
/opt/repairshop/server/
/opt/repairshop/client/
/opt/repairshop/node_modules/
/opt/repairshop/package.json

# Config (owned by root, group repairshop)
%dir %attr(750,root,repairshop) /etc/repairshop
%config(noreplace) %attr(640,root,repairshop) /etc/repairshop/repairshop.conf
%config(noreplace) %attr(640,root,repairshop) %{_sysconfdir}/sysconfig/repairshop

# Systemd unit
%{_unitdir}/repairshop.service

# Helper
%{_bindir}/repairshop-config

# Data and log directories (owned by repairshop service user)
%dir %attr(750,repairshop,repairshop) /var/lib/repairshop
%dir %attr(750,repairshop,repairshop) /var/lib/repairshop/uploads
%dir %attr(750,repairshop,repairshop) /var/lib/repairshop/uploads/avatars
%dir %attr(750,repairshop,repairshop) /var/lib/repairshop/uploads/photos
%dir %attr(750,repairshop,repairshop) /var/log/repairshop

%changelog
* Mon Apr 13 2026 fam1152 <fam1152> - 9.0-1
- v9.0: Reports tab with XLS export, parts orders, HTTPS/SSL support
- AI RAM meter, Ollama 4-state status, model controls
- Manufacturer breakdown in inventory, Display settings tab
- Full changelog in Updates tab, per-user dark mode

* Sun Apr 12 2026 fam1152 <fam1152> - 8.0-1
- v8.0: AI assistant via Ollama — diagnosis, notes, customer messages
- Money tab, Chat page, Dashboard clock and AI greeting
- Troubleshooting tab, docker-compose editor, per-user settings

* Sat Apr 11 2026 fam1152 <fam1152> - 7.0-1
- v7.0: Docker update checker, staff accounts, scheduled backups

* Fri Apr 10 2026 fam1152 <fam1152> - 1.0-1
- Initial RPM release
