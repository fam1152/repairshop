const router = require('express').Router();
const auth = require('./auth.middleware');
const https = require('https');

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

// ── CHECK FOR UPDATE ──
router.get('/check', async (req, res) => {
  const image = getImageName();
  const dockerAvailable = isDockerAvailable();

  if (!dockerAvailable) {
    return res.json({
      available: false,
      docker_socket: false,
      image,
      message: 'Docker socket not mounted. Add the socket volume to docker-compose.yml to enable updates.'
    });
  }

  try {
    const [localDigest, remoteDigest] = await Promise.all([
      getLocalDigest(image),
      getRemoteDigest(image)
    ]);

    const updateAvailable = !!(localDigest && remoteDigest && localDigest !== remoteDigest);

    res.json({
      available: updateAvailable,
      docker_socket: true,
      image,
      local_digest: localDigest ? localDigest.slice(0, 19) + '…' : null,
      remote_digest: remoteDigest ? remoteDigest.slice(0, 19) + '…' : null,
      checked_at: new Date().toISOString(),
      message: updateAvailable
        ? 'A new version is available on Docker Hub.'
        : localDigest && remoteDigest
          ? 'You are running the latest version.'
          : 'Could not determine update status — check that the image is public or Docker Hub credentials are configured.'
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
    app_version: 'v10'
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

module.exports = router;
