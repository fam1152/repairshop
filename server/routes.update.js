const router = require('express').Router();
const auth = require('./auth.middleware');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

router.use(auth);

const upload = multer({ dest: '/tmp/' });

// Get the image name this container is running as
async function getImageName() {
  if (process.env.DOCKER_IMAGE) return process.env.DOCKER_IMAGE;
  
  // Try to ask the socket who I am (works in Docker and Podman if socket is mounted)
  try {
    if (fs.existsSync('/var/run/docker.sock')) {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const containers = await docker.listContainers();
      const os = require('os');
      const hostname = os.hostname();
      // Hostname is usually the container ID
      const me = containers.find(c => c.Id.startsWith(hostname) || hostname.startsWith(c.Id.slice(0, 10)));
      if (me && me.Image) {
        return me.Image;
      }
    }
  } catch(e) {}

  return 'fam1152/repairshop:latest';
}

function isPodman() {
  return fs.existsSync('/.containerenv');
}

// Fetch JSON from a URL
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'Accept': 'application/json', ...headers } };
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

async function getDockerHubToken(image) {
  const [repo] = image.split(':');
  try {
    const r = await fetchJson(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`);
    return r.data.token || null;
  } catch(e) { return null; }
}

async function getRemoteDigest(image) {
  const [repo, tag = 'latest'] = image.split(':');
  try {
    const token = await getDockerHubToken(image);
    if (!token) return null;
    const r = await fetchJson(`https://registry-1.docker.io/v2/${repo}/manifests/${tag}`, {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
    });
    return r.headers['docker-content-digest'] || null;
  } catch(e) { return null; }
}

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
  } catch(e) { return Promise.resolve(null); }
}

function isDockerAvailable() {
  return fs.existsSync('/var/run/docker.sock');
}

// ── ROUTES ──

router.get('/github-latest', async (req, res) => {
  try {
    const r = await fetchJson('https://api.github.com/repos/fam1152/repairshop/releases/latest', { 'User-Agent': 'RepairShop-App' });
    if (r.status !== 200) throw new Error('GitHub API returned ' + r.status);
    res.json({
      version: r.data.tag_name,
      name: r.data.name,
      published_at: r.data.published_at,
      url: r.data.html_url,
      body: r.data.body,
      assets: r.data.assets.map(a => ({ name: a.name, url: a.browser_download_url, size: a.size }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/check', async (req, res) => {
  const image = await getImageName();
  const dockerAvailable = isDockerAvailable();

  if (!dockerAvailable) {
    return res.json({
      available: false,
      docker_socket: false,
      image,
      message: 'Management socket not mounted. See instructions below to enable automatic updates.'
    });
  }

  try {
    const [localDigest, remoteDigest] = await Promise.all([ getLocalDigest(image), getRemoteDigest(image) ]);
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
      message: updateAvailable ? 'A new version is available on Docker Hub.' : canDetermine ? 'You are running the latest version.' : 'Could not determine update status.'
    });
  } catch(e) { res.status(500).json({ available: false, error: e.message }); }
});

router.post('/apply', async (req, res) => {
  const image = await getImageName();
  if (!isDockerAvailable()) return res.status(400).json({ error: 'Socket not available' });

  res.json({ ok: true, message: 'Update started. Restarting...' });

  setTimeout(async () => {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
        });
      });
      const containers = await docker.listContainers();
      const hostname = require('os').hostname();
      const me = containers.find(c => c.Id.startsWith(hostname) || hostname.startsWith(c.Id.slice(0, 10)));
      if (me) {
        const container = docker.getContainer(me.Id);
        setTimeout(() => { container.restart({ t: 5 }, () => {}); }, 1000);
      } else { process.exit(0); }
    } catch(e) { console.error('[Update] Failed:', e.message); }
  }, 500);
});

router.get('/info', async (req, res) => {
  res.json({
    image: await getImageName(),
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime()),
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    docker_socket: isDockerAvailable(),
    is_podman: isPodman(),
    is_git: fs.existsSync(path.join(__dirname, '../.git')),
    app_version: 'v11.1.2'
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

router.post('/git-pull', async (req, res) => {
  const gitDir = path.join(__dirname, '../.git');
  if (!fs.existsSync(gitDir)) return res.status(400).json({ error: 'Not a git repository' });
  res.json({ ok: true, message: 'Updating from git...' });
  const rootDir = path.join(__dirname, '..');
  const cmd = `cd ${rootDir} && git pull && npm install && cd client && npm install && npm run build`;
  exec(cmd, () => { setTimeout(() => process.exit(0), 1000); });
});

module.exports = router;
