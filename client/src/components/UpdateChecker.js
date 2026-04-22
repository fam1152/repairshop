import React, { useState, useEffect } from 'react';
import axios from 'axios';

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hr${h !== 1 ? 's' : ''}`);
  parts.push(`${m} min`);
  return parts.join(', ');
}

export default function UpdateChecker() {
  const [info, setInfo] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [forceUpdating, setForceUpdating] = useState(false);
  const [sudoModal, setSudoModal] = useState(false);
  const [sudoPass, setSudoPass] = useState('');
  const [sudoStatus, setSudoStatus] = useState('');

  useEffect(() => {
    axios.get('/api/update/info').then(r => setInfo(r.data)).catch(() => {});
  }, []);

  const forceUpdate = async () => {
    if (!window.confirm('Force update now?\n\nThis will pull the latest Docker image and restart the container. You will be disconnected for ~60 seconds.')) return;
    setForceUpdating(true);
    try {
      await axios.post('/api/system/force-update');
      let secs = 65; setCountdown(secs);
      const t = setInterval(() => { secs--; setCountdown(secs); if (secs <= 0) { clearInterval(t); window.location.reload(); } }, 1000);
      setTimeout(() => { const poll = setInterval(() => { axios.get('/api/update/info').then(() => { clearInterval(poll); window.location.reload(); }).catch(() => {}); }, 3000); }, 15000);
    } catch(e) { alert('Force update failed: ' + (e.response?.data?.error || e.message)); setForceUpdating(false); }
  };

  const runSudoCompose = async () => {
    if (!sudoPass) return;
    setSudoStatus('Running docker compose pull + up…');
    try {
      await axios.post('/api/system/compose-update', { sudo_password: sudoPass });
      setSudoStatus('✓ Command sent — check Troubleshooting logs for progress');
      setSudoPass('');
      setTimeout(() => setSudoModal(false), 3000);
    } catch(e) { setSudoStatus('❌ ' + (e.response?.data?.error || e.message)); }
  };

  const checkForUpdate = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const r = await axios.get('/api/update/check');
      setCheckResult(r.data);
      
      // If not docker, also check GitHub
      if (!r.data.docker_socket) {
        try {
          const gh = await axios.get('/api/update/github-latest');
          setCheckResult(prev => ({ ...prev, github: gh.data }));
        } catch(e) {}
      }
    } catch(e) {
      setCheckResult({ available: false, error: 'Could not reach update server — check your internet connection.' });
    }
    setChecking(false);
  };

  const runGitUpdate = async () => {
    if (!window.confirm('Update from Git?\n\nThis will run "git pull", rebuild the frontend, and restart. This may take a few minutes.')) return;
    setApplying(true);
    try {
      await axios.post('/api/update/git-pull');
      setCountdown(120); // Longer countdown for build
    } catch(e) {
      alert('Git update failed: ' + (e.response?.data?.error || e.message));
      setApplying(false);
    }
  };

  const applyUpdate = async () => {
    if (!window.confirm('Apply update now?\n\nThe app will pull the latest image and restart. You will be disconnected for about 30–60 seconds.')) return;
    setApplying(true);
    try {
      await axios.post('/api/update/apply');
      // Start countdown
      let secs = 60;
      setCountdown(secs);
      const timer = setInterval(() => {
        secs--;
        setCountdown(secs);
        if (secs <= 0) {
          clearInterval(timer);
          // Try to reload
          window.location.reload();
        }
      }, 1000);

      // Also try polling to reload as soon as the server is back
      setTimeout(() => {
        const poll = setInterval(() => {
          axios.get('/api/update/info').then(() => {
            clearInterval(poll);
            window.location.reload();
          }).catch(() => {});
        }, 3000);
      }, 15000);

    } catch(e) {
      setApplying(false);
      alert('Update failed to start. Check the server logs.');
    }
  };

  if (countdown !== null) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Updating…</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
          The container is restarting with the new image. This page will reload automatically.
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{countdown}s</div>
        <div style={{ width: '100%', height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, width: `${((60 - countdown) / 60) * 100}%`, transition: 'width 1s linear' }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          If the page doesn't reload automatically, <button className="btn btn-sm" style={{ display: 'inline' }} onClick={() => window.location.reload()}>click here</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Version info card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>🐳 Container info</div>
        {info ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              ['Image', info.image],
              ['Version', info.app_version],
              ['Node.js', info.node_version],
              ['Uptime', formatUptime(info.uptime_seconds)],
              ['Started', info.started_at ? new Date(info.started_at).toLocaleString() : '—'],
              [info.is_podman ? 'Podman socket' : 'Docker socket', info.docker_socket ? '✓ Connected' : '✗ Not mounted'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all', color: (label === 'Docker socket' || label === 'Podman socket') ? (info.docker_socket ? 'var(--success)' : 'var(--danger)') : 'var(--text)' }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
        )}
      </div>

      {/* Docker/Podman socket warning */}
      {info && !info.docker_socket && (
        <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
          <strong>⚠️ {info.is_podman ? 'Podman' : 'Docker'} socket not mounted.</strong> To enable automatic updates, add this to your {info.is_podman ? 'podman run command or ' : ''}docker-compose.yml under <code>volumes:</code>:
          <pre style={{ background: 'var(--warning-light)', marginTop: 8, fontSize: 12, fontFamily: 'monospace' }}>
            {info.is_podman ? '- /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock' : '- /var/run/docker.sock:/var/run/docker.sock'}
          </pre>
          
          {info.is_podman && (
            <div style={{ marginTop: 10, lineHeight: 1.5 }}>
              💡 <strong>Podman Auto-Update:</strong> If you prefer Podman's built-in system, add <code>--label "io.containers.autoupdate=image"</code> to your run command. Then, <code>podman auto-update</code> will work from your host's terminal.
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            Then run <code>docker compose up -d</code> (or podman-compose) to apply the change.
          </div>
        </div>
      )}

      {/* Check for updates */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>🔍 Check for updates</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Compares the currently running image digest against the latest version on Docker Hub.
          If an update is available, you can apply it with one click — the app pulls the new image and restarts automatically.
        </p>

        {checkResult && (
          <div style={{
            background: (checkResult.available || checkResult.github) ? 'var(--accent-light)' : checkResult.unknown ? 'var(--warning-light)' : checkResult.error ? 'var(--danger-light)' : 'var(--success-light)',
            border: `1px solid ${(checkResult.available || checkResult.github) ? 'var(--accent)' : checkResult.unknown ? 'var(--warning)' : checkResult.error ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 14,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, color: (checkResult.available || checkResult.github) ? 'var(--accent)' : checkResult.unknown ? 'var(--warning)' : checkResult.error ? 'var(--danger)' : 'var(--success)', marginBottom: 4 }}>
              {(checkResult.available || checkResult.github) ? '🆕 Update available!' : checkResult.unknown ? '⚠️ Status Unknown' : checkResult.error ? '❌ Check failed' : '✓ Up to date'}
            </div>
            <div style={{ color: 'var(--text2)' }}>{checkResult.error || checkResult.message}</div>
            
            {checkResult.github && !info?.docker_socket && (
              <div style={{ marginTop: 10, padding: '10px', background: 'var(--bg1)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Latest GitHub Release: {checkResult.github.version}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Published {new Date(checkResult.github.published_at).toLocaleDateString()}</div>
                <a href={checkResult.github.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>View Release on GitHub</a>
              </div>
            )}

            {checkResult.local_digest && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace' }}>
                <div>Running: {checkResult.local_digest}</div>
                <div>Latest:  {checkResult.remote_digest}</div>
              </div>
            )}
            {checkResult.checked_at && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Checked at {new Date(checkResult.checked_at).toLocaleTimeString()}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={checkForUpdate}
            disabled={checking || applying}>
            {checking ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Checking for updates…
              </span>
            ) : '🔍 Check for update'}
          </button>

          {checkResult?.available && (
            <button
              className="btn btn-primary"
              onClick={applyUpdate}
              disabled={applying}
              style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>
              {applying ? 'Starting update…' : '⬆️ Apply update now'}
            </button>
          )}

          {checkResult?.available && !info?.docker_socket && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, width: '100%' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>🛠️ Manual Update (Recommended for Production)</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                Since the management socket is not connected, run these commands on your server to update:
              </p>
              <pre style={{ background: '#1e293b', color: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 11, fontFamily: 'monospace', overflow: 'auto' }}>
                {`# Pull latest image\ndocker pull ${info?.image || 'fam1152/repairshop:latest'}\n\n# Restart with new version\ndocker compose up -d`}
              </pre>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                Your data in <code>./repairshop-data</code> will be safe.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {info?.is_git && (
            <button
              className="btn btn-sm"
              onClick={runGitUpdate}
              disabled={applying}
              title="Update from Git source">
              🐙 git pull & rebuild
            </button>
          )}

          <button className="btn btn-sm" onClick={forceUpdate} disabled={forceUpdating || !!countdown} style={{ marginLeft: 'auto' }}>
            {forceUpdating ? '⏳ Updating…' : '⚡ Force update'}
          </button>
          <button className="btn btn-sm" onClick={() => setSudoModal(true)}>
            🐳 docker compose update
          </button>
        </div>

        {/* Sudo compose modal */}
        {sudoModal && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setSudoModal(false); setSudoStatus(''); } }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2>🐳 docker compose update</h2>
                <button className="btn btn-icon btn-sm" onClick={() => { setSudoModal(false); setSudoStatus(''); }}>✕</button>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
                  Runs <code>docker compose pull && docker compose up -d</code> on the host via sudo.
                  This updates the docker-compose.yml and restarts all services.
                </p>
                {sudoStatus ? (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, background: sudoStatus.startsWith('✓') ? 'var(--success-light)' : sudoStatus.startsWith('❌') ? 'var(--danger-light)' : 'var(--accent-light)', color: sudoStatus.startsWith('✓') ? 'var(--success)' : sudoStatus.startsWith('❌') ? 'var(--danger)' : 'var(--accent)' }}>
                    {sudoStatus}
                  </div>
                ) : (
                  <div>
                    <div className="form-group">
                      <label>sudo password</label>
                      <input className="form-control" type="password" value={sudoPass} onChange={e => setSudoPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSudoCompose()} placeholder="Enter your sudo password" autoFocus />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 14 }}>
                      ⚠️ Password is used once and not stored.
                    </div>
                    <div className="modal-footer">
                      <button className="btn" onClick={() => setSudoModal(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={runSudoCompose} disabled={!sudoPass}>Run update</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* How it works */}
      <div className="card" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>ℹ️ How updates work</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          <div>1. Click <strong>Check for update</strong> — compares your running image to Docker Hub</div>
          <div>2. If a new version is available, click <strong>Apply update now</strong></div>
          <div>3. The app pulls the new image from Docker Hub (~1–3 minutes)</div>
          <div>4. The container restarts automatically with the new version</div>
          <div>5. This page reloads and you're on the latest version</div>
          <div style={{ marginTop: 8, color: 'var(--text3)', fontSize: 12 }}>
            Your database and all data are stored in <code>/mnt/tank/repairshop-data/</code> and are never touched during updates.
          </div>
        </div>
      </div>

      {/* Full changelog */}
      <Changelog />
    </div>
  );
}

function Changelog() {
  const TYPE_STYLES = {
    release: { bg: 'var(--accent)',       color: '#fff',             label: 'Release'  },
    feature: { bg: 'var(--success-light)', color: 'var(--success)',  label: 'Feature'  },
    fix:     { bg: 'var(--warning-light)', color: 'var(--warning)',  label: 'Fix'      },
    security:{ bg: 'var(--danger-light)',  color: 'var(--danger)',   label: 'Security' },
  };

  // Full hardcoded changelog — always accurate regardless of DB
  const CHANGELOG = [
    {
      version: 'v11.1.2', date: '2026-04-22', type: 'release',
      changes: [
        'Added direct docker-compose.yml creation/paste if file not found on host',
        'Added Manual Update instruction block with CLI commands for production',
        'Improved docker-compose.yml path detection (checks multiple app locations)',
        'Enhanced UI with darker, code-friendly editor for configuration files',
        'Fixed bug in Troubleshooting tab where logs would occasionally stall',
      ]
    },
    {
      version: 'v11.1.0', date: '2026-04-22', type: 'release',
      changes: [
        'Added custom Ollama API URL override in Settings → AI (connect to external PCs)',
        'Improved Ollama auto-discovery with intelligent subnet scanning',
        'Fixed "White Screen" on startup by adding API request timeouts and loading states',
        'Added React Error Boundary to display crash details instead of a blank screen',
        'Fixed critical "Server security misconfiguration" error with automatic JWT_SECRET generation',
        'Enhanced User Profile management: set theme preferences (Dark/Light) for other accounts',
        'Fixed theme persistence bug where Dark Mode would revert to Light on some accounts',
        'Consolidated AI logic and removed conflicting routes for better stability',
      ]
    },
    {
      version: 'v10.1.2', date: '2026-04-19', type: 'fix',
      changes: [
        'Fixed SyntaxError (duplicate db declaration) in main server file',
        'Improved version synchronization across all build artifacts',
      ]
    },
    {
      version: 'v10.1.1', date: '2026-04-19', type: 'fix',
      changes: [
        'Fixed critical server crash due to duplicate db variable declaration',
      ]
    },
    {
      version: 'v10.1.0', date: '2026-04-19', type: 'feature',
      changes: [
        'Multi-mode update system: automated Git Pull & Rebuild for source installs',
        'Enhanced update instructions and GitHub release links in UI',
        'Database Fix: Added missing manufacturer and device_type columns to inventory',
        'Improved update detection for local builds (Status Unknown handling)',
        'Cleanup of build artifacts and incorrectly named shell expansion directories',
      ]
    },
    {
      version: 'v10.0', date: '2026-04-13', type: 'feature',
      changes: [
        'Admin-only company info and tax/invoice settings editing — all accounts can view',
        'Invoice balance tracking — create invoices with a balance, apply partial payments',
        'Apply payment button with payment method and history log',
        'Mark paid and Apply to account balance buttons on invoices',
        'Authorized pickup person per invoice — name and phone number',
        'All users can approve estimates (not admin-only)',
        'Log Call button on Dashboard — search customer by name or phone, open account and enter notes',
        'See Notes button on customer account — toggles account notes panel',
        'Customer product keys tab — add multiple product keys with Add button, copy to clipboard',
        'Customer documents tab — Upload and Scan document buttons with camera support',
        'OS and version fields on repairs — shown when Laptop/Desktop/Server selected',
        'Custom intake date on repairs — enter historical repair data with correct dates',
        'Custom created_at on repairs for historical data entry',
        'Authorized pickup per invoice — name and phone of authorized person',
        'Customer Google Contacts sync per account and bulk sync from Cloud settings',
        'Settings → ☁️ Cloud tab — Google Contacts sync and Google Calendar sync buttons',
        'Force update button in Updates tab — pulls latest Docker image and restarts',
        'sudo docker compose update in Troubleshooting with password prompt',
        'Appointments auto-populate customer when opened from customer account',
        'New repair/appointment from customer account auto-fills customer field',
        'Trash / Recycle Bin page — restore deleted repairs, customers, invoices, estimates',
        'Per-user dark mode fixed — loads and saves correctly for all accounts',
        'Staff accounts have full access to all features except user management',
        'Version bumped to v10.0',
      ]
    },

    {
      version: 'v9.0', date: '2026-04-13', type: 'feature',
      changes: [
        'Added Money tab — revenue overview, 6-month bar charts, top customers, invoice breakdown',
        'Added Tools & Equipment tracker with all-time spend total',
        'Added Chat page — team messaging, direct messages, and RepairBot AI chatbot',
        'Added live clock (MM/DD/YYYY HH:MM:SS) on Dashboard',
        'Added AI greeting on login — personalized to time of day and shop status',
        'Added Quick Chat box on Dashboard for instant RepairBot access',
        'Added Troubleshooting tab in Settings — live log viewer, system info, reboot with auto-backup',
        'Reboot now restarts both RepairShop and Ollama containers',
        'Added docker-compose.yml editor in Troubleshooting tab',

        'Added per-user dark mode preference — each account saves its own setting',
        'Added AI training data — save custom Q&A examples and shop context',
        'Added AI model controls — Start, Restart, Unload from memory buttons',
        'Added live RAM usage meter in AI tab — Ollama, system, and Node.js heap',
        'Added Ollama 4-state status indicator — Off / Loading / Running / Error with pulse animation',
        'Added AI model update checker with one-click pull',
        'Changelog added to Updates tab — complete version history',
        'Dark mode moved to new Display tab in Settings',
        'Removed revenue/money stats from Dashboard',
        'License updated to copyright fam1152',
      ]
    },
    {
      version: 'v8.0', date: '2026-04-13', type: 'feature',
      changes: [
        'Added AI assistant powered by Ollama — fully local, free, no API keys',
        'AI repair diagnosis — suggests causes, steps, and parts from your inventory',
        'AI note formatter — rough notes in, clean professional notes out',
        'AI customer message drafts — status updates, pickup notices, follow-ups',
        'AI inventory reorder suggestions — analyzes usage history',
        'AI business insights — weekly/monthly plain-English business summary',
        'AI status badge on Dashboard with 30-second auto-refresh',
        'Ollama runs as a second Docker container alongside RepairShop',
        'Added Settings → AI Assistant tab with model manager and download',
      ]
    },
    {
      version: 'v7.0', date: '2026-04-12', type: 'feature',
      changes: [
        'Added Settings → Updates tab with Docker image update checker',
        'Check for updates compares running image digest against Docker Hub',
        'One-click Apply update — pulls new image and restarts container automatically',
        'Page auto-reloads with 60-second countdown after update',
        'Container info panel — image, version, Node.js, uptime, started at',
        'NEW badge on Settings nav when update is available',
        'DOCKER_IMAGE env var added to docker-compose.yml',
        'Docker socket mounted into container for update and reboot functionality',
      ]
    },
    {
      version: 'v6.0', date: '2026-04-11', type: 'feature',
      changes: [
        'Added staff account management — create, edit, disable, delete accounts',
        'Admin can reset any staff member\'s password',
        'User profile photos — upload avatar, shown in sidebar above sign out',
        'Activity log — 30-day rolling log of every action by every user',
        'Admin sees all users\' activity, staff see only their own',
        'Appointments now record which account created them (Booked by column)',
        'Scheduled automatic backups — daily or weekly to a host path',
        'Keeps last 10 backups automatically, removes older ones',
        'Software license (Proprietary — copyright fam1152) added',
        'License tab in Settings',
      ]
    },
    {
      version: 'v5.0', date: '2026-04-10', type: 'feature',
      changes: [
        'Added Backup & Restore in Settings',
        'One-click download full backup zip — database + all uploads + logos',
        'Drag-and-drop restore — validates zip before overwriting, safety copy created',
        'Shows record counts and database size before backup',
        'ZFS snapshot guidance included',
        'Scheduled backup settings stored in database',
      ]
    },
    {
      version: 'v4.0', date: '2026-04-09', type: 'feature',
      changes: [
        'Added Estimates/Quotes — line items, tax, valid-until date, status tracking',
        'Estimates generate branded PDF with customer signature line',
        'One-click convert estimate to invoice',
        'Added photo documentation on repair tickets — intake, during, completed, damage stages',
        'Camera capture supported on mobile devices',
        'Lightbox viewer with download link for each photo',
        'Added Appointments page with weekly calendar grid view',
        'Google Calendar sync — appointments create/update Google Calendar events',
        'One-click convert appointment to repair ticket',
        'Staff-only internal booking (no public page)',
      ]
    },
    {
      version: 'v3.0', date: '2026-04-08', type: 'feature',
      changes: [
        'Added Scanner & Labels page',
        'Camera barcode and QR code scanning using ZXing library',
        'Supports QR codes, CODE128, EAN-13, UPC-A, Data Matrix',
        'Manual text entry fallback if camera unavailable',
        'Lookup resolves PART-id, REPAIR-id, DEVICE-serial, raw SKU',
        'Label generator for inventory parts — QR + CODE128 barcode on each label',
        'Repair ticket labels — QR code + device serial QR if available',
        'Printable label sheets via browser print dialog',
        'Intake PDF updated — serial number prominently displayed',
      ]
    },
    {
      version: 'v2.0', date: '2026-04-07', type: 'feature',
      changes: [
        'Added Inventory tracking — parts with SKU, category, supplier, location',
        'Low stock alerts with configurable threshold per item',
        'Stock adjustments — add, remove, or set exact quantity with reason',
        'Full transaction history per inventory item',
        'Stock value calculated automatically (qty × cost)',
        'Low/out-of-stock badge on Inventory sidebar nav item',
        'Low stock alert widget on Dashboard',
        'Printable repair intake form PDF — customer signature, device condition, parts table',
        'Print button added to every repair ticket',
      ]
    },
    {
      version: 'v1.0', date: '2026-04-06', type: 'release',
      changes: [
        'Initial release',
        'Customer management — profiles, call logs, repair history',
        'Repair tickets — status tracking, device info, technician notes, parts used, warranty',
        'Invoicing — line items, tax, customizable branding, PDF generation',
        'Reminders — 1–30 day follow-ups, in-app banners, overdue highlighting',
        'Dashboard — repair counts by status, monthly/yearly totals',
        'Settings — company info, tax rate, invoice color, logo upload',
        'Dark mode toggle',
        'Login screen with JWT authentication',
        'Self-hosted on TrueNAS SCALE via Docker',
        'Runs on Windows and Fedora Linux for development',
      ]
    },
  ];

  const [expanded, setExpanded] = useState('v11.1.2');

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>📋 Complete changelog</div>
      {CHANGELOG.map(entry => {
        const ts = TYPE_STYLES[entry.type] || TYPE_STYLES.feature;
        const isOpen = expanded === entry.version;
        return (
          <div key={entry.version} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : entry.version)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: isOpen ? 'var(--bg3)' : 'var(--bg2)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', minWidth: 44 }}>{entry.version}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: ts.bg, color: ts.color }}>{ts.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>{entry.date}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{entry.changes.length} change{entry.changes.length !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {/* Change list */}
            {isOpen && (
              <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
                {entry.changes.map((change, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 13 }}>
                    <span style={{ color: ts.color, flexShrink: 0, marginTop: 1 }}>•</span>
                    <span style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{change}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
