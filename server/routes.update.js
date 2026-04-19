const router = require('express').Router();
const auth = require('./auth.middleware');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

router.use(auth);

// Get the image name this container is running as
function getImageName() {
  return process.env.DOCKER_IMAGE || 'fam1152/repairshop:latest';
}

// Fetch JSON from a URL (no extra deps needed — uses built-in https)
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'Accept': 'application/json', ...headers }
    };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch(e) { reject(new Error('Invalid JSON response')); }
      });
    }).on('error', reject);
  });
}

// Get Docker Hub token for a private or public repo
async function getDockerHubToken(image) {
  const [repo] = image.split(':');
  try {
    const r = await fetchJson(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`
    );
    return r.data.token || null;
  } catch(e) {
    return null;
  }
}

// Get the remote digest from Docker Hub registry API
async function getRemoteDigest(image) {
  const [repo, tag = 'latest'] = image.split(':');
  try {
    const token = await getDockerHubToken(image);
    if (!token) return null;

    const r = await fetchJson(
      `https://registry-1.docker.io/v2/${repo}/manifests/${tag}`,
      {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
      }
    );
    // The digest is in the response header
    return r.headers['docker-content-digest'] || null;
  } catch(e) {
    return null;
  }
}

// Get the local image digest via Docker socket
function getLocalDigest(image) {
  try {
    const Docker = require('dockerode');
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    return new Promise((resolve) => {
      docker.getImage(image).inspect((err, data) => {
        if (err || !data) return resolve(null);
        const digest = data.RepoDigests?.[0]?.split('@')[1] || null;
        resolve(digest);
      });
    });
  } catch(e) {
    return Promise.resolve(null);
  }
}

// Check if Docker socket is available
function isDockerAvailable() {
  try {
    const fs = require('fs');
    return fs.existsSync('/var/run/docker.sock');
  } catch(e) { return false; }
}

// Check if running as RPM
function isRpmInstall() {
  return process.cwd().startsWith('/opt/repairshop') || fs.existsSync('/etc/repairshop/repairshop.conf');
}

// ── GET LATEST FROM GITHUB ──
router.get('/github-latest', async (req, res) => {
  try {
    // We use the GitHub API to get the latest release
    const r = await fetchJson('https://api.github.com/repos/fam1152/repairshop/releases/latest', {
      'User-Agent': 'RepairShop-App'
    });
    if (r.status !== 200) throw new Error('GitHub API returned ' + r.status);
    res.json({
      version: r.data.tag_name,
      name: r.data.name,
      published_at: r.data.published_at,
      url: r.data.html_url,
      body: r.data.body,
      assets: r.data.assets.map(a => ({ name: a.name, url: a.browser_download_url, size: a.size }))
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHECK FOR UPDATE ──
router.get('/check', async (req, res) => {
  const image = getImageName();
  const dockerAvailable = isDockerAvailable();
  const rpmInstall = isRpmInstall();

  if (!dockerAvailable) {
    // If not docker, we can still check GitHub
    return res.json({
      available: false,
      docker_socket: false,
      is_rpm: rpmInstall,
      image,
      message: rpmInstall 
        ? 'Running as RPM package. Updates should be applied via: sudo dnf upgrade repairshop'
        : 'Docker socket not mounted. Add the socket volume to docker-compose.yml to enable automatic updates.'
    });
  }

  try {
    const [localDigest, remoteDigest] = await Promise.all([
      getLocalDigest(image),
      getRemoteDigest(image)
    ]);

    const canDetermine = !!(localDigest && remoteDigest);
    const updateAvailable = canDetermine && localDigest !== remoteDigest;

    res.json({
      available: updateAvailable,
      unknown: !canDetermine,
      docker_socket: true,
      image,
      local_digest: localDigest ? localDigest.slice(0, 19) + '…' : null,
      remote_digest: remoteDigest ? remoteDigest.slice(0, 19) + '…' : null,
      checked_at: new Date().toISOString(),
      message: updateAvailable
        ? 'A new version is available on Docker Hub.'
        : canDetermine
          ? 'You are running the latest version.'
          : 'Could not determine update status — the local image was likely built from source and has no registry digest yet.'
    });
  } catch(e) {
    res.status(500).json({ available: false, error: e.message });
  }
});

// ── PULL AND RESTART ──
// Pulls the latest image then restarts the container
router.post('/apply', async (req, res) => {
  const image = getImageName();

  if (!isDockerAvailable()) {
    return res.status(400).json({ error: 'Docker socket not available' });
  }

  // Send response immediately — the container will restart and connection will drop
  res.json({
    ok: true,
    message: 'Update started. The app will restart in about 30–60 seconds. Refresh this page to reconnect.'
  });

  // Pull and restart after response is sent
  setTimeout(async () => {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      console.log(`[Update] Pulling ${image}…`);

      // Pull the new image
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });

      console.log('[Update] Pull complete. Restarting container…');

      // Find and restart our own container
      const containers = await docker.listContainers();
      const self = containers.find(c =>
        c.Image === image ||
        c.Names.some(n => n.includes('repairshop'))
      );

      if (self) {
        const container = docker.getContainer(self.Id);
        // Small delay then restart
        setTimeout(() => {
          container.restart({ t: 5 }, (err) => {
            if (err) console.error('[Update] Restart error:', err.message);
            else console.log('[Update] Container restarted successfully');
          });
        }, 2000);
      } else {
        console.warn('[Update] Could not find own container to restart');
      }
    } catch(e) {
      console.error('[Update] Update failed:', e.message);
    }
  }, 500);
});

// ── GET CURRENT VERSION INFO ──
router.get('/info', (req, res) => {
  res.json({
    image: getImageName(),
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime()),
    uptime_human: formatUptime(process.uptime()),
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    docker_socket: isDockerAvailable(),
    is_git: fs.existsSync(path.join(__dirname, '../.git')),
    app_version: 'v11.0.0'
  });
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// ── GIT UPDATE (SOURCE INSTALLS) ──
router.post('/git-pull', async (req, res) => {
  const gitDir = path.join(__dirname, '../.git');
  if (!fs.existsSync(gitDir)) {
    return res.status(400).json({ error: 'Not a git repository' });
  }

  res.json({ ok: true, message: 'Update started. pulling changes and rebuilding... The app will restart when finished.' });

  const rootDir = path.join(__dirname, '..');
  const cmd = `cd ${rootDir} && git pull && npm install && cd client && npm install && npm run build`;
  
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('[Update] Git update failed:', err.message);
      console.error(stderr);
    } else {
      console.log('[Update] Git update successful. Restarting...');
      setTimeout(() => process.exit(0), 1000);
    }
  });
});

module.exports = router;
