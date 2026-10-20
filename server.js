const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3080;

// Admin credentials (override via ADMIN_USER and ADMIN_PASS environment variables)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const activeAdminSessions = new Set();

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const GAMES_DIR = path.join(UPLOADS_DIR, 'games');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');
const TMP_DIR = path.join(UPLOADS_DIR, 'tmp');

// Ensure required directories and data file exist
[DATA_DIR, UPLOADS_DIR, GAMES_DIR, COVERS_DIR, TMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  return Boolean(token && activeAdminSessions.has(token));
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized: Admin sign-in required.' });
  }
  return next();
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Serve /admin route using the main SPA shell (opens Admin Panel automatically)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

// GET /api/admin/session - Check current admin auth status
app.get('/api/admin/session', (req, res) => {
  if (isAdminAuthenticated(req)) {
    return res.json({ authenticated: true, username: ADMIN_USER });
  }
  return res.json({ authenticated: false });
});

// POST /api/admin/login - Authenticate admin and set HttpOnly session cookie
app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  if (safeEqual(username.trim(), ADMIN_USER) && safeEqual(password, ADMIN_PASS)) {
    const token = crypto.randomBytes(32).toString('hex');
    activeAdminSessions.add(token);
    res.setHeader(
      'Set-Cookie',
      `admin_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`
    );
    return res.json({ authenticated: true, username: ADMIN_USER });
  }
  return res.status(401).json({ error: 'Invalid admin username or password.' });
});

// POST /api/admin/logout - Destroy admin session
app.post('/api/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.admin_session) {
    activeAdminSessions.delete(cookies.admin_session);
  }
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  return res.json({ authenticated: false });
});

function readGames() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeGames(games) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2), 'utf8');
}

// Find entry HTML file inside an extracted folder
function findEntryHtml(baseDir, currentDir = baseDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  // Priority 1: index.html in current directory
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
      return path.relative(baseDir, path.join(currentDir, entry.name)).replace(/\\/g, '/');
    }
  }

  // Priority 2: any .html file in current directory
  for (const entry of entries) {
    if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      return path.relative(baseDir, path.join(currentDir, entry.name)).replace(/\\/g, '/');
    }
  }

  // Priority 3: search subdirectories recursively
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findEntryHtml(baseDir, path.join(currentDir, entry.name));
      if (found) return found;
    }
  }

  return null;
}

// Search top 5 game icons with "icon" appended to the query
async function searchGameIcons(rawQuery) {
  const base = String(rawQuery || '').trim();
  const searchQuery = /\bicon$/i.test(base) ? base : `${base} icon`;
  const encodedQuery = encodeURIComponent(searchQuery);
  const results = [];
  const seen = new Set();

  const addResult = (url, thumbUrl, title) => {
    const cleanUrl = (url || thumbUrl || '').replace(/&amp;/g, '&');
    const cleanThumb = (thumbUrl || url || '').replace(/&amp;/g, '&');
    if (!cleanThumb || seen.has(cleanThumb)) return;
    seen.add(cleanThumb);
    results.push({
      url: cleanUrl,
      thumbnailUrl: cleanThumb,
      title: title || searchQuery
    });
  };

  // 1. Optional Google Custom Search Image API (if GOOGLE_API_KEY and GOOGLE_CSE_ID are set)
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
    try {
      const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        process.env.GOOGLE_API_KEY
      )}&cx=${encodeURIComponent(
        process.env.GOOGLE_CSE_ID
      )}&searchType=image&num=5&q=${encodedQuery}`;
      const cseRes = await fetch(cseUrl);
      if (cseRes.ok) {
        const cseData = await cseRes.json();
        for (const item of cseData.items || []) {
          addResult(item.link, item.image?.thumbnailLink || item.link, item.title);
          if (results.length >= 5) break;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Direct Google Images search (www.google.com/search?tbm=isch&q=<game>+icon)
  if (results.length < 5) {
    try {
      const gRes = await fetch(`https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=en`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (gRes.ok) {
        const gHtml = await gRes.text();
        const gThumbs = [
          ...gHtml.matchAll(/https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:[^"&\s<>\\]+/g)
        ].map((m) => m[0]);
        for (const thumb of gThumbs) {
          addResult(thumb, thumb, searchQuery);
          if (results.length >= 5) break;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. Web Image Search fallback for "<game> icon" (when Google blocks automated requests with JS challenge)
  if (results.length < 5) {
    try {
      const bRes = await fetch(
        `https://www.bing.com/images/search?q=${encodedQuery}&form=HDRSC2`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      );
      if (bRes.ok) {
        const bHtml = await bRes.text();
        const itemRegex =
          /murl&quot;:&quot;(https?:\/\/(?:(?!&quot;).)+)&quot;,&quot;turl&quot;:&quot;(https?:\/\/(?:(?!&quot;).)+)&quot;/g;
        for (const match of bHtml.matchAll(itemRegex)) {
          addResult(match[1], match[2], searchQuery);
          if (results.length >= 5) break;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 4. App Store Game Icon supplement if fewer than 5 results found
  if (results.length < 5) {
    try {
      const iRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(base)}&entity=software&limit=5`
      );
      if (iRes.ok) {
        const iData = await iRes.json();
        for (const item of iData.results || []) {
          const art = item.artworkUrl512 || item.artworkUrl100;
          if (art) {
            addResult(art, art, item.trackName || searchQuery);
            if (results.length >= 5) break;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    query: searchQuery,
    results: results.slice(0, 5)
  };
}

// GET /api/admin/icon-search - Search top 5 icons for "<game name> icon" (Admin Only)
app.get('/api/admin/icon-search', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Search query is required.' });
  }
  try {
    const data = await searchGameIcons(q);
    return res.json(data);
  } catch (err) {
    console.error('Icon search error:', err);
    return res.status(500).json({ error: 'Failed to search icons.' });
  }
});

// Download and save an icon locally into /uploads/covers/<gameId>-icon.<ext>
async function downloadAndSaveCover(gameId, candidateUrls) {
  let savedCoverUrl = null;
  for (const candidateUrl of candidateUrls.filter(Boolean)) {
    try {
      const cleanUrl = candidateUrl.replace(/&amp;/g, '&');
      const imgRes = await fetch(cleanUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
      });
      if (imgRes.ok) {
        const contentType = (imgRes.headers.get('content-type') || '').toLowerCase();
        let ext = '.jpg';
        if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('gif')) ext = '.gif';

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        if (buffer.length > 200) {
          const filename = `${gameId}-icon${ext}`;
          fs.writeFileSync(path.join(COVERS_DIR, filename), buffer);
          savedCoverUrl = `/uploads/covers/${filename}`;
          break;
        }
      }
    } catch {
      // Try next candidate URL
    }
  }
  return savedCoverUrl;
}

// Parse GitHub URL or shorthand (e.g., "owner/repo", "https://github.com/owner/repo/tree/branch/subpath")
function parseGitHubUrl(input) {
  let str = String(input || '').trim();
  if (!str) return null;
  str = str.replace(/^\[.*?\]\((.*?)\)$/, '$1').trim();
  str = str.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
  str = str.replace(/\.git$/i, '');
  str = str.replace(/\/+$/, '');
  const parts = str.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  let branch = null;
  let subpath = null;
  if (parts[2] === 'tree' && parts[3]) {
    branch = parts[3];
    if (parts.length > 4) {
      subpath = parts.slice(4).join('/');
    }
  }
  return { owner, repo, branch, subpath, fullName: `${owner}/${repo}` };
}

// Download GitHub repository as a ZIP archive buffer
async function downloadGitHubRepoZip(owner, repo, branch, token) {
  const branchesToTry = branch ? [branch] : ['main', 'master', 'gh-pages'];
  const headers = {
    'User-Agent': 'ArcadeVault-Game-Importer'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  for (const b of branchesToTry) {
    const codeloadUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${b}`;
    try {
      const res = await fetch(codeloadUrl, { headers });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 100) {
          return { buffer: buf, branch: b };
        }
      }
    } catch {
      // Try next
    }
  }

  // Fallback to GitHub API zipball
  try {
    const apiZipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch || ''}`;
    const res = await fetch(apiZipUrl, { headers, redirect: 'follow' });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) {
        return { buffer: buf, branch: branch || 'default' };
      }
    }
  } catch {
    // Ignore
  }

  throw new Error(`Could not download repository ${owner}/${repo}. Check the repository name or branch permissions.`);
}

// Detect individual games within a downloaded repository ZIP
function scanZipForGames(zip, subpath = '') {
  const entries = zip.getEntries();
  const normalizedSubpath = subpath ? subpath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';

  const allEntryNames = entries.map((e) => e.entryName.replace(/\\/g, '/'));
  let rootPrefix = '';
  const firstSlash = allEntryNames[0]?.indexOf('/');
  if (firstSlash > 0) {
    const candidate = allEntryNames[0].slice(0, firstSlash + 1);
    if (allEntryNames.every((p) => p.startsWith(candidate) || p === candidate.slice(0, -1))) {
      rootPrefix = candidate;
    }
  }

  const htmlEntries = entries.filter((e) => {
    if (e.isDirectory) return false;
    const name = e.entryName.replace(/\\/g, '/');
    const rel = name.slice(rootPrefix.length);
    if (normalizedSubpath && !rel.startsWith(normalizedSubpath)) return false;
    if (rel.includes('/node_modules/') || rel.startsWith('node_modules/')) return false;
    if (rel.includes('/.git/') || rel.startsWith('.git/')) return false;
    const base = path.basename(name).toLowerCase();
    return base === 'index.html' || base === 'index.htm' || base === 'game.html' || base === 'play.html';
  });

  if (htmlEntries.length === 0) {
    const anyHtml = entries.filter((e) => {
      if (e.isDirectory) return false;
      const name = e.entryName.replace(/\\/g, '/');
      const rel = name.slice(rootPrefix.length);
      if (normalizedSubpath && !rel.startsWith(normalizedSubpath)) return false;
      if (rel.includes('/node_modules/') || rel.includes('/.git/') || rel.includes('/docs/')) return false;
      return /\.html?$/i.test(name);
    });
    if (anyHtml.length > 0) {
      htmlEntries.push(anyHtml[0]);
    }
  }

  if (htmlEntries.length === 0) return [];

  const gamesMap = new Map();
  for (const entry of htmlEntries) {
    const fullName = entry.entryName.replace(/\\/g, '/');
    const relName = fullName.slice(rootPrefix.length);
    const entryDir = path.dirname(relName);
    const normalizedDir = entryDir === '.' ? '' : entryDir;

    let gameDirKey = normalizedDir;
    const stripped = normalizedDir.replace(/\/(dist|build|public|web|bin|export|client)$/i, '');
    if (stripped !== normalizedDir) {
      gameDirKey = stripped;
    }

    if (!gamesMap.has(gameDirKey)) {
      gamesMap.set(gameDirKey, {
        gameDir: gameDirKey,
        entryRelPath: relName,
        entryEntryName: entry.entryName
      });
    }
  }

  const dirs = Array.from(gamesMap.keys());
  let targetDirs = dirs;
  if (dirs.length > 1 && dirs.includes('')) {
    targetDirs = dirs.filter((d) => d !== '');
  }

  return targetDirs.map((dirKey) => {
    const item = gamesMap.get(dirKey);
    const fullPrefix = rootPrefix
      ? `${rootPrefix}${item.gameDir ? item.gameDir + '/' : ''}`
      : item.gameDir
      ? `${item.gameDir}/`
      : '';
    return {
      gameDir: item.gameDir,
      entryRelPath: item.entryRelPath,
      entryEntryName: item.entryEntryName,
      fullPrefix
    };
  });
}

// Extract files belonging to a specific game with Zip-Slip path traversal defense
function extractGameAssets(zip, gameItem, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const prefix = gameItem.fullPrefix;
  const entries = zip.getEntries();

  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (prefix && !name.startsWith(prefix)) {
      continue;
    }

    const innerRel = prefix ? name.slice(prefix.length) : name;
    if (!innerRel || innerRel === '/') continue;

    const normalized = path.normalize(innerRel);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      continue;
    }

    const dest = path.join(targetDir, normalized);
    if (!dest.startsWith(targetDir)) {
      continue;
    }

    if (entry.isDirectory) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }
  }

  return findEntryHtml(targetDir) || 'index.html';
}

// Clean and format HTML <title> strings by stripping boilerplate phrases
function cleanExtractedTitle(rawTitle) {
  if (!rawTitle) return '';
  let t = rawTitle.trim();
  t = t.replace(/\s*[-|•–—]\s*(GitHub|HTML5(?:\s*Canvas)?(?:\s*Game)?|Free Online Game|Play Online|Canvas Game|JavaScript Game|Browser Game).*$/i, '').trim();
  if (t && !/^(document|webpack app|vite app|react app|index|untitled|html5 game)$/i.test(t)) {
    return t;
  }
  return '';
}

// Generate normalized comparison keys to match game titles regardless of punctuation/case/spacing
function titleKeys(title) {
  if (!title) return [];
  const s = String(title).toLowerCase();
  const spaced = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = s.replace(/[^a-z0-9]/g, '');
  return [spaced, compact].filter(Boolean);
}

// Check if two game titles refer to the same game
function isSameGame(titleA, titleB) {
  const keysA = titleKeys(titleA);
  const keysB = titleKeys(titleB);
  if (!keysA.length || !keysB.length) return false;
  return keysA.some((k) => keysB.includes(k));
}

// Find existing game in library by title or repo source
function findExistingGame(title, repoFullName, gameDir, existingGames) {
  for (const g of existingGames) {
    if (title && g.title && isSameGame(title, g.title)) {
      return g;
    }
    if (repoFullName && g.sourceRepo && g.sourceRepo.toLowerCase() === repoFullName.toLowerCase()) {
      const gDir = (g.sourceDir || '').toLowerCase();
      const targetDir = (gameDir || '').toLowerCase();
      if (gDir === targetDir) {
        return g;
      }
    }
  }
  return null;
}

// Fast pre-extraction title peek directly from the zip in memory
function peekGameTitle(zip, gameItem, repoInfo) {
  let title = '';
  if (gameItem.entryEntryName) {
    try {
      const entry = zip.getEntry(gameItem.entryEntryName);
      if (entry) {
        const html = entry.getData().toString('utf8');
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = cleanExtractedTitle(titleMatch[1]);
        }
      }
    } catch {
      // Ignore peek error
    }
  }

  if (!title) {
    const rawName = gameItem.gameDir ? path.basename(gameItem.gameDir) : repoInfo.repo;
    title = rawName
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  return title;
}

// Extract game metadata (title, category, author, description)
function extractGameMetadata(targetDir, entryHtmlRel, gameItem, repoInfo, defaultCategory) {
  let title = '';
  let description = '';

  const indexHtmlPath = path.join(targetDir, entryHtmlRel);
  if (fs.existsSync(indexHtmlPath)) {
    try {
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = cleanExtractedTitle(titleMatch[1]);
      }
      const descMatch = htmlContent.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) {
        description = descMatch[1].trim();
      }
    } catch {
      // Ignore
    }
  }

  if (!title) {
    const rawName = gameItem.gameDir ? path.basename(gameItem.gameDir) : repoInfo.repo;
    title = rawName
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  let category = defaultCategory || 'Arcade';
  const lower = title.toLowerCase();
  if (category === 'All' || category === 'Auto') {
    if (/puzzle|tetris|match|block|sudoku|2048|chess|trivia/i.test(lower)) category = 'Puzzle';
    else if (/action|shooter|bullet|fight|combat|ninja/i.test(lower)) category = 'Action';
    else if (/mario|sonic|retro|pacman|arcade|space invaders|galaga|asteroids|pong|snake/i.test(lower)) category = 'Retro';
    else if (/platform|jump|runner|run|climb/i.test(lower)) category = 'Platformer';
    else if (/strategy|defense|tower|card|tactics/i.test(lower)) category = 'Strategy';
    else if (/rpg|quest|adventure|dungeon/i.test(lower)) category = 'RPG';
    else category = 'Arcade';
  }

  const author = repoInfo.owner || 'Indie Creator';
  if (!description) {
    description = `Imported from GitHub: ${repoInfo.fullName}`;
  }

  return { title, category, author, description };
}

// PUT /api/games/:id/icon - Save selected icon from Step 2 (Admin Only)
app.put('/api/games/:id/icon', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { iconUrl, thumbnailUrl } = req.body || {};

  if (!iconUrl && !thumbnailUrl) {
    return res.status(400).json({ error: 'Icon URL is required.' });
  }

  const games = readGames();
  const game = games.find((g) => g.id === id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found.' });
  }

  let savedCoverUrl = await downloadAndSaveCover(id, [thumbnailUrl, iconUrl]);
  if (!savedCoverUrl) {
    savedCoverUrl = thumbnailUrl || iconUrl;
  }

  game.coverUrl = savedCoverUrl;
  writeGames(games);

  return res.json(game);
});

// POST /api/admin/mass-import-github - Mass import GitHub game repositories with automated 1st icon selection (Admin Only)
app.post('/api/admin/mass-import-github', requireAdmin, async (req, res) => {
  const {
    repoUrls = [],
    defaultCategory = 'Arcade',
    autoPickFirstIcon = true,
    githubToken = ''
  } = req.body || {};

  const rawLines = Array.isArray(repoUrls) ? repoUrls : String(repoUrls || '').split(/[\r\n,]+/);
  const cleanUrls = rawLines.map((s) => s.trim()).filter(Boolean);

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one GitHub repository URL.' });
  }

  const isStream = req.headers.accept?.includes('text/event-stream') || req.query.stream === '1';
  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  const sendEvent = (type, data) => {
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type, timestamp: new Date().toISOString(), ...data })}\n\n`);
    }
  };

  sendEvent('start', { totalRepos: cleanUrls.length });

  const importedGames = [];
  const skippedGames = [];
  const errors = [];
  const existingGames = readGames();

  for (let rIdx = 0; rIdx < cleanUrls.length; rIdx++) {
    const rawUrl = cleanUrls[rIdx];
    const parsed = parseGitHubUrl(rawUrl);

    if (!parsed) {
      errors.push({ url: rawUrl, error: 'Invalid GitHub URL or repository format.' });
      sendEvent('log', { level: 'error', message: `Invalid repository URL format: "${rawUrl}"` });
      continue;
    }

    sendEvent('log', {
      level: 'info',
      message: `[${rIdx + 1}/${cleanUrls.length}] Downloading ${parsed.fullName}...`
    });

    let zipResult;
    try {
      zipResult = await downloadGitHubRepoZip(parsed.owner, parsed.repo, parsed.branch, githubToken);
      sendEvent('log', {
        level: 'success',
        message: `Downloaded ${parsed.fullName} (branch: ${zipResult.branch}, size: ${(zipResult.buffer.length / 1024).toFixed(1)} KB)`
      });
    } catch (err) {
      errors.push({ url: rawUrl, error: err.message });
      sendEvent('log', { level: 'error', message: `Failed to download ${parsed.fullName}: ${err.message}` });
      continue;
    }

    let detectedGames = [];
    try {
      const zip = new AdmZip(zipResult.buffer);
      detectedGames = scanZipForGames(zip, parsed.subpath);

      if (detectedGames.length === 0) {
        errors.push({ url: rawUrl, error: 'No playable HTML5 game entry file found in repository.' });
        sendEvent('log', {
          level: 'warn',
          message: `No playable game files found in ${parsed.fullName}. Make sure it contains an index.html.`
        });
        continue;
      }

      sendEvent('log', {
        level: 'info',
        message: `Discovered ${detectedGames.length} game(s) in ${parsed.fullName}`
      });

      for (let gIdx = 0; gIdx < detectedGames.length; gIdx++) {
        const gameItem = detectedGames[gIdx];

        // Step 1: Pre-check if game already exists before extracting assets
        const peekedTitle = peekGameTitle(zip, gameItem, parsed);
        const existingBefore = findExistingGame(peekedTitle, parsed.fullName, gameItem.gameDir, existingGames);

        if (existingBefore) {
          skippedGames.push({
            title: peekedTitle,
            existingTitle: existingBefore.title,
            repo: parsed.fullName,
            reason: 'Already in library'
          });
          sendEvent('game_skipped', {
            title: peekedTitle,
            existingTitle: existingBefore.title,
            repo: parsed.fullName,
            reason: `Already in library as "${existingBefore.title}"`
          });
          sendEvent('log', {
            level: 'warn',
            message: `⏭️ Skipped "${peekedTitle}" from ${parsed.fullName} (already in library as "${existingBefore.title}")`
          });
          continue;
        }

        const gameId = crypto.randomUUID();
        const targetGameDir = path.join(GAMES_DIR, gameId);

        sendEvent('log', {
          level: 'info',
          message: `Extracting game ${gIdx + 1}/${detectedGames.length} from ${parsed.fullName}...`
        });

        const entryHtmlRel = extractGameAssets(zip, gameItem, targetGameDir);
        const meta = extractGameMetadata(targetGameDir, entryHtmlRel, gameItem, parsed, defaultCategory);

        // Step 2: Post-metadata verification in case full HTML yielded a matching title
        const existingAfter = findExistingGame(meta.title, parsed.fullName, gameItem.gameDir, existingGames);
        if (existingAfter) {
          try {
            fs.rmSync(targetGameDir, { recursive: true, force: true });
          } catch {}

          skippedGames.push({
            title: meta.title,
            existingTitle: existingAfter.title,
            repo: parsed.fullName,
            reason: 'Already in library'
          });
          sendEvent('game_skipped', {
            title: meta.title,
            existingTitle: existingAfter.title,
            repo: parsed.fullName,
            reason: `Already in library as "${existingAfter.title}"`
          });
          sendEvent('log', {
            level: 'warn',
            message: `⏭️ Skipped "${meta.title}" from ${parsed.fullName} (already in library as "${existingAfter.title}")`
          });
          continue;
        }

        sendEvent('log', {
          level: 'info',
          message: `Extracted game: "${meta.title}" (${meta.category}) by ${meta.author}`
        });

        let coverUrl = null;
        if (autoPickFirstIcon) {
          sendEvent('log', {
            level: 'info',
            message: `Searching Google Images for "${meta.title} icon" (auto-picking 1st result)...`
          });
          try {
            const iconData = await searchGameIcons(meta.title);
            if (iconData && Array.isArray(iconData.results) && iconData.results.length > 0) {
              const firstIcon = iconData.results[0]; // Exactly the first one!
              coverUrl = await downloadAndSaveCover(gameId, [firstIcon.thumbnailUrl, firstIcon.url]);
              if (coverUrl) {
                sendEvent('log', {
                  level: 'success',
                  message: `Applied 1st icon result for "${meta.title}"`
                });
              }
            }
          } catch (err) {
            console.warn('Auto icon error:', err.message);
          }

          if (!coverUrl) {
            const iconCandidates = ['icon.png', 'favicon.ico', 'cover.png', 'logo.png', 'thumbnail.png'];
            for (const cand of iconCandidates) {
              const candPath = path.join(targetGameDir, cand);
              if (fs.existsSync(candPath)) {
                const ext = path.extname(cand);
                const savedName = `${gameId}-icon${ext}`;
                fs.copyFileSync(candPath, path.join(COVERS_DIR, savedName));
                coverUrl = `/uploads/covers/${savedName}`;
                sendEvent('log', { level: 'info', message: `Using repo asset icon for "${meta.title}"` });
                break;
              }
            }
          }
        }

        const newGame = {
          id: gameId,
          title: meta.title,
          category: meta.category,
          author: meta.author,
          description: meta.description,
          sourceType: 'file',
          sourceRepo: parsed.fullName,
          sourceDir: gameItem.gameDir || '',
          playUrl: `/uploads/games/${gameId}/${entryHtmlRel}`,
          coverUrl,
          createdAt: new Date().toISOString()
        };

        existingGames.unshift(newGame);
        writeGames(existingGames);
        importedGames.push(newGame);

        sendEvent('game_imported', {
          game: newGame,
          progress: {
            current: importedGames.length,
            repo: parsed.fullName
          }
        });
      }
    } catch (err) {
      errors.push({ url: rawUrl, error: err.message });
      sendEvent('log', { level: 'error', message: `Error processing ${parsed.fullName}: ${err.message}` });
    }
  }

  sendEvent('complete', {
    totalImported: importedGames.length,
    totalSkipped: skippedGames.length,
    totalErrors: errors.length,
    importedGames,
    skippedGames,
    errors
  });

  if (!isStream) {
    return res.json({
      success: true,
      totalImported: importedGames.length,
      totalSkipped: skippedGames.length,
      totalErrors: errors.length,
      importedGames,
      skippedGames,
      errors
    });
  } else {
    res.end();
  }
});

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: 150 * 1024 * 1024 // 150 MB max
  }
});

// GET /api/games - Return all games (Public)
app.get('/api/games', (req, res) => {
  res.json(readGames());
});

// POST /api/games - Upload a new web game (Admin Only)
app.post(
  '/api/games',
  requireAdmin,
  upload.fields([
    { name: 'gameFile', maxCount: 1 },
    { name: 'coverFile', maxCount: 1 }
  ]),
  (req, res) => {
    const gameFile = req.files?.gameFile?.[0];
    const coverFile = req.files?.coverFile?.[0];

    const cleanupTmp = () => {
      if (gameFile && fs.existsSync(gameFile.path)) fs.unlinkSync(gameFile.path);
      if (coverFile && fs.existsSync(coverFile.path)) fs.unlinkSync(coverFile.path);
    };

    try {
      const title = (req.body.title || '').trim();
      const category = (req.body.category || 'Arcade').trim();
      const author = (req.body.author || 'Indie Creator').trim();
      const description = (req.body.description || '').trim();
      const sourceType = req.body.sourceType || 'file';
      const externalUrl = (req.body.gameUrl || '').trim();

      if (!title) {
        cleanupTmp();
        return res.status(400).json({ error: 'Game title is required.' });
      }

      const id = crypto.randomUUID();
      let playUrl = '';

      if (sourceType === 'url') {
        if (!/^https?:\/\/.+/i.test(externalUrl)) {
          cleanupTmp();
          return res.status(400).json({ error: 'Please provide a valid HTTP/HTTPS game URL.' });
        }
        playUrl = externalUrl;
        if (gameFile && fs.existsSync(gameFile.path)) fs.unlinkSync(gameFile.path);
      } else {
        if (!gameFile) {
          cleanupTmp();
          return res.status(400).json({ error: 'Please select an .html or .zip game file to upload.' });
        }

        const ext = path.extname(gameFile.originalname).toLowerCase();
        const targetGameDir = path.join(GAMES_DIR, id);
        fs.mkdirSync(targetGameDir, { recursive: true });

        if (ext === '.html' || ext === '.htm') {
          const destHtml = path.join(targetGameDir, 'index.html');
          fs.renameSync(gameFile.path, destHtml);
          playUrl = `/uploads/games/${id}/index.html`;
        } else if (ext === '.zip') {
          const zip = new AdmZip(gameFile.path);
          const zipEntries = zip.getEntries();

          // Safe extraction preventing path traversal (Zip-Slip)
          for (const entry of zipEntries) {
            const normalizedPath = path.normalize(entry.entryName);
            if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
              continue;
            }
            const fullDestPath = path.join(targetGameDir, normalizedPath);
            if (!fullDestPath.startsWith(targetGameDir)) {
              continue;
            }
            if (entry.isDirectory) {
              fs.mkdirSync(fullDestPath, { recursive: true });
            } else {
              fs.mkdirSync(path.dirname(fullDestPath), { recursive: true });
              fs.writeFileSync(fullDestPath, entry.getData());
            }
          }

          fs.unlinkSync(gameFile.path);

          const entryRelPath = findEntryHtml(targetGameDir);
          if (!entryRelPath) {
            fs.rmSync(targetGameDir, { recursive: true, force: true });
            if (coverFile && fs.existsSync(coverFile.path)) fs.unlinkSync(coverFile.path);
            return res.status(400).json({
              error: 'No .html file was found inside the uploaded .zip archive. Make sure your web game export contains an index.html file.'
            });
          }

          playUrl = `/uploads/games/${id}/${entryRelPath}`;
        } else {
          fs.rmSync(targetGameDir, { recursive: true, force: true });
          cleanupTmp();
          return res.status(400).json({ error: 'Only .html, .htm, or .zip files are supported for playable web games.' });
        }
      }

      let coverUrl = null;
      if (coverFile) {
        const coverExt = path.extname(coverFile.originalname).toLowerCase() || '.png';
        const allowedCovers = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
        if (allowedCovers.includes(coverExt)) {
          const coverFilename = `${id}${coverExt}`;
          fs.renameSync(coverFile.path, path.join(COVERS_DIR, coverFilename));
          coverUrl = `/uploads/covers/${coverFilename}`;
        } else if (fs.existsSync(coverFile.path)) {
          fs.unlinkSync(coverFile.path);
        }
      }

      const newGame = {
        id,
        title,
        category,
        author: author || 'Indie Creator',
        description: description || 'No description provided.',
        sourceType,
        playUrl,
        coverUrl,
        createdAt: new Date().toISOString()
      };

      const games = readGames();
      games.unshift(newGame);
      writeGames(games);

      return res.status(201).json(newGame);
    } catch (err) {
      cleanupTmp();
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Failed to process game upload.' });
    }
  }
);

// DELETE /api/games/:id - Delete a game and its uploaded files (Admin Only)
app.delete('/api/games/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const games = readGames();
  const index = games.findIndex((g) => g.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Game not found.' });
  }

  const [removed] = games.splice(index, 1);
  writeGames(games);

  // Clean up game directory on disk
  const targetGameDir = path.join(GAMES_DIR, id);
  if (fs.existsSync(targetGameDir)) {
    fs.rmSync(targetGameDir, { recursive: true, force: true });
  }

  // Clean up cover file if present
  if (removed.coverUrl && removed.coverUrl.startsWith('/uploads/covers/')) {
    const coverPath = path.join(ROOT_DIR, removed.coverUrl);
    if (fs.existsSync(coverPath)) {
      fs.unlinkSync(coverPath);
    }
  }

  return res.json({ success: true });
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`ArcadeVault server running at http://localhost:${port}`);
    console.log(`Admin Panel URL: http://localhost:${port}/admin (default user: ${ADMIN_USER})`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}

startServer(DEFAULT_PORT);
