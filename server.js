const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { downloadGame, downloadGameHtml5, downloadGameDirect } = require('itchio-downloader');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3080;

// Admin credentials (override via ADMIN_USER and ADMIN_PASS environment variables)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const GAMES_DIR = path.join(UPLOADS_DIR, 'games');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');
const TMP_DIR = path.join(UPLOADS_DIR, 'tmp');

function readSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      return new Set(Array.isArray(arr) ? arr : []);
    }
  } catch {}
  return new Set();
}

function writeSessions(set) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(set), null, 2), 'utf8');
  } catch {}
}

const activeAdminSessions = readSessions();

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
    writeSessions(activeAdminSessions);
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
    writeSessions(activeAdminSessions);
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

function readSuggestions() {
  try {
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
      return Array.isArray(arr) ? arr : [];
    }
  } catch (err) {
    console.error('Error reading suggestions file:', err);
  }
  return [];
}

function writeSuggestions(suggestions) {
  try {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing suggestions file:', err);
  }
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

// Search top 5 game icons with multi-source fallback (DuckDuckGo, Bing, iTunes, Wikipedia, Google)
async function searchGameIcons(rawQuery) {
  const base = String(rawQuery || '')
    .replace(/\s*[\(\[](?:html5|web|js|v[\d\.]+|online|free)[\)\]]/gi, '')
    .trim();
  const searchQuery = /\bicon$/i.test(base) ? base : `${base} icon`;
  const results = [];
  const seen = new Set();

  const addResult = (url, thumbUrl, title, width, height) => {
    const cleanUrl = (url || thumbUrl || '').replace(/&amp;/g, '&').trim();
    const cleanThumb = (thumbUrl || url || '').replace(/&amp;/g, '&').trim();
    if (!cleanThumb || !cleanThumb.startsWith('http') || seen.has(cleanThumb)) return;
    seen.add(cleanThumb);
    results.push({
      url: cleanUrl,
      thumbnailUrl: cleanThumb,
      title: title || searchQuery,
      width: width || 0,
      height: height || 0
    });
  };

  // 1. DuckDuckGo Image Search API (Fast, authentic game icons with direct CDN delivery)
  try {
    const ddgPageUrl = `https://duckduckgo.com/?q=${encodeURIComponent(base + ' game icon')}&iax=images&ia=images`;
    const ddgRes = await fetch(ddgPageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const vqdMatch = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']([0-9-]+)["']/);
      if (vqdMatch) {
        const vqd = vqdMatch[1];
        const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
          base + ' game icon'
        )}&vqd=${vqd}&f=,,,`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://duckduckgo.com/'
          }
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          for (const item of data.results || []) {
            addResult(item.image, item.thumbnail, item.title, item.width, item.height);
            if (results.length >= 6) break;
          }
        }
      }
    }
  } catch (err) {
    // Continue to next providers
  }

  // 2. Bing Images Search (murl / turl extraction)
  if (results.length < 5) {
    try {
      const bRes = await fetch(
        `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&form=HDRSC2`,
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
          if (results.length >= 6) break;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. Apple iTunes Software Search (Official 512x512 App Icons)
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
            if (results.length >= 6) break;
          }
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 4. Wikipedia Commons / Video Game Page Images
  if (results.length < 5) {
    try {
      const wikiRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          base + ' video game'
        )}&gsrlimit=5&prop=pageimages&pithumbsize=512&format=json`
      );
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : [];
        for (const page of pages) {
          const thumb = page?.thumbnail?.source;
          if (thumb) {
            addResult(thumb, thumb, page.title);
            if (results.length >= 6) break;
          }
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 5. Optional Google Custom Search Image API (if credentials set)
  if (results.length < 5 && process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
    try {
      const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        process.env.GOOGLE_API_KEY
      )}&cx=${encodeURIComponent(
        process.env.GOOGLE_CSE_ID
      )}&searchType=image&num=5&q=${encodeURIComponent(searchQuery)}`;
      const cseRes = await fetch(cseUrl);
      if (cseRes.ok) {
        const cseData = await cseRes.json();
        for (const item of cseData.items || []) {
          addResult(item.link, item.image?.thumbnailLink || item.link, item.title);
          if (results.length >= 5) break;
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

// GET /api/search-icons - Public/Client alias for searching game icons
app.get('/api/search-icons', async (req, res) => {
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

// Format a folder or file slug into a clean human-readable game title
function formatSlugToTitle(slug) {
  return String(slug || '')
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
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

  const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.github', '.vscode', '.idea', 'bower_components',
    'vendor', 'vendors', 'docs', 'doc', 'test', 'tests', '__tests__', 'spec',
    'specs', 'coverage', 'partials', 'templates', 'includes', 'components'
  ]);

  const IGNORE_FILES = /^(404|403|500|error|readme|license|copying|privacy|terms|tos|contact|about|credits|changelog|help|instructions|faq|offline|blank|empty|template|test|spec|oauth|callback|login|signup|register|header|footer|nav|sidebar|modal|popup|ad|ads|google[0-9a-f]+)\.html?$/i;

  const INDEX_PRIORITY = ['index.html', 'index.htm', 'game.html', 'play.html', 'main.html', 'start.html', 'launch.html'];
  const INDEX_SET = new Set(INDEX_PRIORITY);

  const COLLECTION_DIR_NAMES = new Set([
    'games', 'game', 'projects', 'project', 'gfiles', 'html5', 'arcade',
    'roms', 'collection', 'collections', 'apps', 'play', 'webgames', 'files',
    'list', 'all', 'public', 'src', 'static', 'pages'
  ]);

  const candidateEntries = [];
  for (const e of entries) {
    if (e.isDirectory) continue;
    const fullName = e.entryName.replace(/\\/g, '/');
    const rel = fullName.slice(rootPrefix.length).replace(/^\/+/, '');
    if (!/\.html?$/i.test(rel)) continue;
    if (normalizedSubpath && rel !== normalizedSubpath && !rel.startsWith(normalizedSubpath + '/')) continue;

    const parts = rel.split('/');
    const fileName = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);

    if (dirParts.some((d) => IGNORE_DIRS.has(d.toLowerCase()) || d.startsWith('.'))) continue;
    if (IGNORE_FILES.test(fileName)) continue;

    candidateEntries.push({
      rel,
      entryName: e.entryName,
      fileName
    });
  }

  if (candidateEntries.length === 0) return [];

  // Group HTML files by their logical directory (stripping build output folders like /dist or /build)
  const dirToItems = new Map();
  for (const item of candidateEntries) {
    const lastSlash = item.rel.lastIndexOf('/');
    const rawDir = lastSlash === -1 ? '' : item.rel.slice(0, lastSlash);
    const logicalDir = rawDir.replace(/\/(dist|build|web|bin|export|client)$/i, '');
    if (!dirToItems.has(logicalDir)) {
      dirToItems.set(logicalDir, []);
    }
    dirToItems.get(logicalDir).push(item);
  }

  const allDirs = Array.from(dirToItems.keys()).sort((a, b) => a.length - b.length);

  // Determine which directories are collection/hub containers vs single-game directories
  const collectionDirs = new Set();
  for (const d of allDirs) {
    const prefix = d === '' ? '' : d + '/';
    const descendantDirs = allDirs.filter((other) => other !== d && (d === '' || other.startsWith(prefix)));
    const descendantIndexDirs = descendantDirs.filter((other) => {
      const items = dirToItems.get(other) || [];
      return items.some((it) => INDEX_SET.has(it.fileName.toLowerCase()));
    });
    const baseName = d ? d.split('/').pop().toLowerCase() : '';
    const itemsInD = dirToItems.get(d) || [];
    const hasIndexInD = itemsInD.some((it) => INDEX_SET.has(it.fileName.toLowerCase()));
    const nonIndexItems = itemsInD.filter((it) => !INDEX_SET.has(it.fileName.toLowerCase()));

    if (
      descendantDirs.length >= 2 ||
      (d === normalizedSubpath && descendantIndexDirs.length >= 1) ||
      (d === normalizedSubpath && !hasIndexInD && descendantDirs.length >= 1) ||
      (descendantDirs.length === 1 && COLLECTION_DIR_NAMES.has(baseName)) ||
      ((d === normalizedSubpath || COLLECTION_DIR_NAMES.has(baseName)) && nonIndexItems.length >= 2) ||
      (!hasIndexInD && nonIndexItems.length >= 2)
    ) {
      collectionDirs.add(d);
    }
  }

  const discoveredGames = [];
  const absorbedDirs = new Set();

  for (const d of allDirs) {
    if (absorbedDirs.has(d)) continue;
    const items = dirToItems.get(d) || [];

    if (collectionDirs.has(d)) {
      // In a collection directory, index.html is a hub/menu page, while standalone named .html files are individual games
      const nonIndexItems = items.filter((it) => !INDEX_SET.has(it.fileName.toLowerCase()));
      for (const item of nonIndexItems) {
        const inferredName = item.fileName.replace(/\.html?$/i, '');
        const fullPrefix = rootPrefix ? `${rootPrefix}${d ? d + '/' : ''}` : d ? `${d}/` : '';
        const innerEntryRel = d ? item.rel.slice(d.length + 1) : item.rel;
        discoveredGames.push({
          gameDir: d,
          entryRelPath: item.rel,
          innerEntryRel,
          entryEntryName: item.entryName,
          fullPrefix,
          isStandaloneFile: true,
          inferredName
        });
      }
    } else {
      // Single-game directory: absorb any internal descendant directories so sub-pages aren't duplicated
      const prefix = d === '' ? '' : d + '/';
      for (const other of allDirs) {
        if (other !== d && (d === '' || other.startsWith(prefix))) {
          absorbedDirs.add(other);
        }
      }

      // Pick best entry HTML file in this directory
      let chosenItem = null;
      for (const idxName of INDEX_PRIORITY) {
        const match = items.find((it) => it.fileName.toLowerCase() === idxName);
        if (match) {
          chosenItem = match;
          break;
        }
      }
      if (!chosenItem) {
        chosenItem = items[0];
      }

      const isIndex = INDEX_SET.has(chosenItem.fileName.toLowerCase());
      const dirBase = d ? d.split('/').pop() : '';
      const inferredName = (!isIndex && !dirBase)
        ? chosenItem.fileName.replace(/\.html?$/i, '')
        : (dirBase || chosenItem.fileName.replace(/\.html?$/i, ''));

      const fullPrefix = rootPrefix ? `${rootPrefix}${d ? d + '/' : ''}` : d ? `${d}/` : '';
      const innerEntryRel = d ? chosenItem.rel.slice(d.length + 1) : chosenItem.rel;

      discoveredGames.push({
        gameDir: d,
        entryRelPath: chosenItem.rel,
        innerEntryRel,
        entryEntryName: chosenItem.entryName,
        fullPrefix,
        isStandaloneFile: false,
        inferredName
      });
    }
  }

  return discoveredGames;
}

// Extract files belonging to a specific game with Zip-Slip path traversal defense
function extractGameAssets(zip, gameItem, targetDir, allDetectedGames = []) {
  fs.mkdirSync(targetDir, { recursive: true });
  const prefix = gameItem.fullPrefix;
  const entries = zip.getEntries();

  // If this is a standalone HTML file in a shared directory, don't copy sibling standalone HTML games or other game folders
  const otherGameDirs = new Set();
  const otherStandaloneEntries = new Set();
  if (gameItem.isStandaloneFile) {
    for (const other of allDetectedGames) {
      if (other.entryRelPath === gameItem.entryRelPath) continue;
      if (other.gameDir && other.gameDir !== gameItem.gameDir) {
        const relDir = gameItem.gameDir
          ? other.gameDir.slice(gameItem.gameDir.length + 1)
          : other.gameDir;
        if (relDir) otherGameDirs.add(relDir.split('/')[0]);
      } else if (other.gameDir === gameItem.gameDir && other.innerEntryRel) {
        otherStandaloneEntries.add(other.innerEntryRel.toLowerCase());
      }
    }
    otherStandaloneEntries.add('index.html');
    otherStandaloneEntries.add('index.htm');
  }

  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (prefix && !name.startsWith(prefix)) {
      continue;
    }

    const innerRel = prefix ? name.slice(prefix.length) : name;
    if (!innerRel || innerRel === '/') continue;

    if (gameItem.isStandaloneFile) {
      const topSeg = innerRel.split('/')[0];
      if (otherGameDirs.has(topSeg)) continue;
      if (!innerRel.includes('/') && otherStandaloneEntries.has(innerRel.toLowerCase())) continue;
    }

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

  if (gameItem.innerEntryRel && fs.existsSync(path.join(targetDir, gameItem.innerEntryRel))) {
    return gameItem.innerEntryRel.replace(/\\/g, '/');
  }
  return findEntryHtml(targetDir) || 'index.html';
}

// Clean and format HTML <title> strings by stripping boilerplate phrases
function cleanExtractedTitle(rawTitle) {
  if (!rawTitle) return '';
  let t = rawTitle.trim();
  t = t.replace(/^Unity WebGL Player\s*[-|•–—:]\s*/i, '').trim();
  t = t.replace(/\s*[-|•–—]\s*(GitHub|Unity WebGL Player|HTML5(?:\s*Canvas)?(?:\s*Game)?|Free Online Game|Play Online|Canvas Game|JavaScript Game|Browser Game|Unblocked).*$/i, '').trim();
  if (
    t &&
    !/^(document|webpack app|vite app|react app|index|untitled|html5 game|html5|game|my game|new game|play|home|main|test|app|application|unity webgl player|webgl|scratch|turbowarp|construct 2|construct 3|gamemaker|phaser|canvas|page|welcome|template|default|loader|emulator|player)$/i.test(t)
  ) {
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

// Find existing game in library by title or repo source path
function findExistingGame(title, repoFullName, entryRelPath, gameDir, existingGames) {
  for (const g of existingGames) {
    if (title && g.title && isSameGame(title, g.title)) {
      return g;
    }
    if (repoFullName && g.sourceRepo && g.sourceRepo.toLowerCase() === repoFullName.toLowerCase()) {
      if (g.sourcePath && entryRelPath) {
        if (g.sourcePath.toLowerCase() === entryRelPath.toLowerCase()) {
          return g;
        }
      } else if (g.sourceDir && gameDir && g.sourceDir.toLowerCase() === gameDir.toLowerCase()) {
        return g;
      }
    }
  }
  return null;
}

// Fast pre-extraction title peek directly from the zip in memory
function peekGameTitle(zip, gameItem, repoInfo, usedTitlesInRepo = new Set()) {
  let title = '';
  const fallbackTitle = formatSlugToTitle(gameItem.inferredName || gameItem.gameDir || repoInfo.repo);

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

  if (title && usedTitlesInRepo.has(title.toLowerCase()) && fallbackTitle && fallbackTitle.toLowerCase() !== title.toLowerCase()) {
    title = fallbackTitle;
  }

  if (!title) {
    title = fallbackTitle;
  }

  return title;
}

// Extract game metadata (title, category, author, description)
function extractGameMetadata(targetDir, entryHtmlRel, gameItem, repoInfo, defaultCategory, usedTitlesInRepo = new Set()) {
  let title = '';
  let description = '';
  const fallbackTitle = formatSlugToTitle(gameItem.inferredName || gameItem.gameDir || repoInfo.repo);

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

  if (title && usedTitlesInRepo.has(title.toLowerCase()) && fallbackTitle && fallbackTitle.toLowerCase() !== title.toLowerCase()) {
    title = fallbackTitle;
  }

  if (!title) {
    title = fallbackTitle;
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

// PUT /api/games/:id - Update game details (Admin Only)
app.put('/api/games/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const games = readGames();
  const game = games.find((g) => g.id === id);

  if (!game) {
    return res.status(404).json({ error: 'Game not found.' });
  }

  const { title, category, author, description, coverUrl, playUrl } = req.body || {};

  if (title !== undefined) {
    const trimmed = String(title || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Game title cannot be empty.' });
    }
    game.title = trimmed;
  }

  if (category !== undefined) {
    game.category = String(category || 'Arcade').trim();
  }

  if (author !== undefined) {
    game.author = String(author || 'Indie Creator').trim();
  }

  if (description !== undefined) {
    game.description = String(description || '').trim();
  }

  if (coverUrl !== undefined) {
    const trimmedCover = String(coverUrl || '').trim();
    if (trimmedCover && /^https?:\/\//i.test(trimmedCover)) {
      const saved = await downloadAndSaveCover(id, [trimmedCover]);
      game.coverUrl = saved || trimmedCover;
    } else {
      game.coverUrl = trimmedCover || null;
    }
  }

  if (playUrl !== undefined && String(playUrl || '').trim()) {
    game.playUrl = String(playUrl).trim();
  }

  game.updatedAt = new Date().toISOString();
  writeGames(games);

  return res.json({ success: true, game });
});

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

// POST /api/admin/redo-icons - Batch redo icons for games (Admin Only)
app.post('/api/admin/redo-icons', requireAdmin, async (req, res) => {
  const { mode = 'missing', gameIds = null } = req.body || {};
  const games = readGames();

  let targets = [];
  if (Array.isArray(gameIds) && gameIds.length > 0) {
    const targetSet = new Set(gameIds);
    targets = games.filter((g) => targetSet.has(g.id));
  } else if (mode === 'all') {
    targets = [...games];
  } else {
    // 'missing' mode: games without coverUrl or with placeholder / SVG cover
    targets = games.filter(
      (g) => !g.coverUrl || g.coverUrl.startsWith('data:image/svg+xml') || g.coverUrl.includes('placeholder')
    );
  }

  let updatedCount = 0;
  const updatedGames = [];

  for (const game of targets) {
    try {
      const searchRes = await searchGameIcons(game.title);
      if (searchRes && Array.isArray(searchRes.results) && searchRes.results.length > 0) {
        const topIcon = searchRes.results[0];
        const savedCover = await downloadAndSaveCover(game.id, [topIcon.thumbnailUrl, topIcon.url]);
        if (savedCover) {
          game.coverUrl = savedCover;
          updatedCount++;
          updatedGames.push({ id: game.id, title: game.title, coverUrl: savedCover });
        }
      }
    } catch (err) {
      console.warn(`Failed to redo icon for "${game.title}":`, err.message);
    }
  }

  if (updatedCount > 0) {
    writeGames(games);
  }

  return res.json({
    success: true,
    mode,
    totalTargeted: targets.length,
    updatedCount,
    updatedGames,
    games
  });
});

// POST /api/admin/redo-game-icon/:id - Redo icon for a single game (Admin Only)
app.post('/api/admin/redo-game-icon/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const games = readGames();
  const game = games.find((g) => g.id === id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found.' });
  }

  try {
    const searchRes = await searchGameIcons(game.title);
    if (!searchRes || !Array.isArray(searchRes.results) || searchRes.results.length === 0) {
      return res.status(404).json({ error: `No online icons found for "${game.title}".` });
    }

    const topIcon = searchRes.results[0];
    const savedCover = await downloadAndSaveCover(game.id, [topIcon.thumbnailUrl, topIcon.url]);
    if (!savedCover) {
      return res.status(500).json({ error: 'Failed to download and save candidate icon.' });
    }

    game.coverUrl = savedCover;
    writeGames(games);

    return res.json({
      success: true,
      game
    });
  } catch (err) {
    console.error(`Error redoing icon for game ${id}:`, err);
    return res.status(500).json({ error: 'Failed to redo game icon.' });
  }
});

// Infer category from itch.io game metadata or title
function inferCategoryFromItch(title, tags = [], defaultCategory = 'Auto') {
  if (defaultCategory && defaultCategory !== 'Auto' && defaultCategory !== 'All') {
    return defaultCategory;
  }
  const tagStr = (Array.isArray(tags) ? tags.join(' ') : String(tags || '')).toLowerCase();
  const lower = (String(title || '') + ' ' + tagStr).toLowerCase();
  if (/fight|fighter|combat|brawl|boxing|boxer|punch|martial|karate|smash|wrestle|ninja|snout|battle/i.test(lower)) return 'Fighting';
  if (/shoot|shooter|gun|fps|sniper|bullet|weapon|rifle|blast|aim|strike|1v1|krunker|doom/i.test(lower)) return 'Shooter';
  if (/race|racing|drift|drive|driver|car|speed|kart|vehicle|traffic|highway|road|slow roads|hexgl/i.test(lower)) return 'Racing';
  if (/sport|sports|ball|soccer|football|basket|golf|tennis|baseball|hockey|skate|retro bowl/i.test(lower)) return 'Sports';
  if (/horror|creepy|spooky|scary|fnaf|slender|zombie|haunt|nightmare|escape/i.test(lower)) return 'Horror';
  if (/idle|clicker|tycoon|incremental|tap|cookie/i.test(lower)) return 'Idle';
  if (/puzzle|2048|tetris|match|block|sudoku|chess|wordle|minesweeper|cut the rope|physics|logic/i.test(lower)) return 'Puzzle';
  if (/platform|platformer|jump|runner|run|climb|vex|geometry dash|ovo|doodle|mario|sonic/i.test(lower)) return 'Platformer';
  if (/strategy|defense|tower|card|tactics|bloons|deck|kingdom/i.test(lower)) return 'Strategy';
  if (/rpg|quest|adventure|dungeon|pokemon|zelda|final fantasy|craft/i.test(lower)) return 'RPG';
  if (/retro|pacman|pac-man|space invaders|galaga|asteroids|pong|atari|nes|gba|pixel/i.test(lower)) return 'Retro';
  if (/slope|action|dodge|chaos|rush/i.test(lower)) return 'Action';
  return 'Arcade';
}

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

      const usedTitlesInRepo = new Set();

      for (let gIdx = 0; gIdx < detectedGames.length; gIdx++) {
        const gameItem = detectedGames[gIdx];

        // Step 1: Pre-check if game already exists before extracting assets
        const peekedTitle = peekGameTitle(zip, gameItem, parsed, usedTitlesInRepo);
        const existingBefore = findExistingGame(
          peekedTitle,
          parsed.fullName,
          gameItem.entryRelPath,
          gameItem.gameDir,
          existingGames
        );

        if (existingBefore) {
          usedTitlesInRepo.add(peekedTitle.toLowerCase());
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

        const entryHtmlRel = extractGameAssets(zip, gameItem, targetGameDir, detectedGames);
        const meta = extractGameMetadata(
          targetGameDir,
          entryHtmlRel,
          gameItem,
          parsed,
          defaultCategory,
          usedTitlesInRepo
        );

        // Step 2: Post-metadata verification in case full HTML yielded a matching title
        const existingAfter = findExistingGame(
          meta.title,
          parsed.fullName,
          gameItem.entryRelPath,
          gameItem.gameDir,
          existingGames
        );
        if (existingAfter) {
          usedTitlesInRepo.add(meta.title.toLowerCase());
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

        usedTitlesInRepo.add(meta.title.toLowerCase());

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
            const iconCandidates = ['icon.png', 'favicon.ico', 'cover.png', 'logo.png', 'thumbnail.png', 'splash.png'];
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
          sourcePath: gameItem.entryRelPath,
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
            current: gIdx + 1,
            totalInRepo: detectedGames.length,
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



// Crawl and rip HTML5 game assets (index.html, JS, WASM, CSS, audio, textures) into targetDir
async function ripHtml5GameFromIndexUrl(indexUrl, targetDir, onLog = () => {}, onProgress = () => {}) {
  const parsedUrl = new URL(indexUrl);
  const baseUrl = new URL('./', parsedUrl);

  onLog(`Fetching entry index.html from ${indexUrl}...`);
  const res = await fetch(indexUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch index.html: HTTP ${res.status}`);
  const htmlContent = await res.text();

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'index.html'), htmlContent, 'utf8');

  // Discover relative asset paths from HTML
  const assetRegex = /(?:src|href|data)\s*=\s*["']([^"']+)["']/gi;
  const discovered = new Set();
  let m;
  while ((m = assetRegex.exec(htmlContent)) !== null) {
    const rawRef = m[1].trim();
    if (!rawRef || rawRef.startsWith('data:') || rawRef.startsWith('#') || rawRef.startsWith('javascript:')) continue;
    try {
      const resolved = new URL(rawRef, baseUrl);
      if (resolved.origin === baseUrl.origin && resolved.pathname.startsWith(baseUrl.pathname)) {
        const rel = resolved.pathname.slice(baseUrl.pathname.length);
        if (rel && !rel.endsWith('/')) {
          discovered.add(rel.replace(/^\/+/, ''));
        }
      }
    } catch {}
  }

  // Scan JS files for referenced media/WASM/asset files
  const jsFiles = [...discovered].filter((f) => f.endsWith('.js'));
  const assetExts = /\.(png|jpg|jpeg|gif|svg|webp|mp3|ogg|wav|m4a|flac|json|xml|atlas|fnt|wasm|css|glsl|vert|frag|bin|dat|tmx|tsx|mem|data)$/i;

  for (const jsRel of jsFiles) {
    try {
      const jsUrl = new URL(jsRel, baseUrl).toString();
      const jsRes = await fetch(jsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (jsRes.ok) {
        const jsText = await jsRes.text();
        const matches = jsText.match(/["']([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]{2,5})["']/g) || [];
        for (const raw of matches) {
          const clean = raw.slice(1, -1).trim().replace(/\\/g, '/').replace(/^\/+/, '');
          if (assetExts.test(clean) && !clean.includes('://')) {
            try {
              const resUrl = new URL(clean, baseUrl);
              if (resUrl.origin === baseUrl.origin && resUrl.pathname.startsWith(baseUrl.pathname)) {
                discovered.add(resUrl.pathname.slice(baseUrl.pathname.length).replace(/^\/+/, ''));
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  let downloadedCount = 1; // index.html
  const allList = [...discovered];
  onLog(`Discovered ${allList.length} asset(s) to rip. Downloading game files...`);

  for (let i = 0; i < allList.length; i++) {
    const assetPath = allList[i];
    const assetLocalPath = path.join(targetDir, assetPath.replace(/\//g, path.sep));
    const assetLocalDir = path.dirname(assetLocalPath);
    if (!fs.existsSync(assetLocalDir)) fs.mkdirSync(assetLocalDir, { recursive: true });

    try {
      const fileUrl = new URL(assetPath, baseUrl).toString();
      const fileRes = await fetch(fileUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (fileRes.ok) {
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        fs.writeFileSync(assetLocalPath, buffer);
        downloadedCount++;
      }
    } catch (err) {
      // non-critical asset skip
    }
    onProgress(i + 1, allList.length);
  }

  return { downloadedCount, entryPath: 'index.html' };
}

// Multi-tier game code ripper for itch.io games
async function ripItchGameCode(itchUrl, tempGameDir, targetGameDir, sendEvent) {
  sendEvent('log', { level: 'info', message: `⚡ Initializing game code ripper for ${itchUrl}...` });

  let pageHtml = '';
  const pageMeta = {};

  try {
    const pageRes = await fetch(itchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (pageRes.ok) {
      pageHtml = await pageRes.text();
      const titleMatch = pageHtml.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || pageHtml.match(/<title>([^<]+)<\/title>/i);
      const imageMatch = pageHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || pageHtml.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
      const descMatch = pageHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const authorMatch = pageHtml.match(/<meta\s+name="author"\s+content="([^"]+)"/i) || pageHtml.match(/class="game_info_panel_widget"[^>]*>[\s\S]*?<td>Author<\/td>\s*<td><a[^>]*>([^<]+)<\/a>/i);

      if (titleMatch) pageMeta.title = titleMatch[1].replace(/by\s+.*$/i, '').trim();
      if (imageMatch) pageMeta.coverImage = imageMatch[1];
      if (descMatch) pageMeta.description = descMatch[1].trim();
      if (authorMatch) pageMeta.author = authorMatch[1].trim();
    }
  } catch (err) {
    // Network lookup fallback
  }

  // Tier 1: Try official itchio-downloader downloadGameHtml5
  sendEvent('log', { level: 'info', message: '📥 Ripping HTML5 game code via itchio-downloader...' });
  let html5Result = null;
  try {
    html5Result = await downloadGameHtml5({
      itchGameUrl: itchUrl,
      downloadDirectory: tempGameDir,
      writeMetaData: true,
      onProgress: (p) => {
        if (p.totalBytes && p.bytesReceived) {
          const pct = Math.round((p.bytesReceived / p.totalBytes) * 100);
          sendEvent('download_progress', { bytesReceived: p.bytesReceived, totalBytes: p.totalBytes, percent: pct });
        }
      }
    });
  } catch (err) {}

  if (html5Result && html5Result.status && fs.existsSync(tempGameDir)) {
    const subdirs = fs.readdirSync(tempGameDir);
    let sourceDir = tempGameDir;
    if (subdirs.length === 1 && fs.statSync(path.join(tempGameDir, subdirs[0])).isDirectory()) {
      sourceDir = path.join(tempGameDir, subdirs[0]);
    }
    if (!fs.existsSync(targetGameDir)) fs.mkdirSync(targetGameDir, { recursive: true });
    fs.cpSync(sourceDir, targetGameDir, { recursive: true });
    const found = findEntryHtml(targetGameDir);
    if (found) {
      const fileCount = html5Result.html5Assets?.length || 1;
      sendEvent('log', { level: 'success', message: `✅ Ripped ${fileCount} game file(s) into local storage.` });
      return {
        entryRelPath: found,
        meta: { ...pageMeta, ...(html5Result.metaData || {}) },
        fileCount
      };
    }
  }

  // Tier 2: Check for embedded itch.zone / hwcdn iframe URL in page HTML
  let iframeUrl = null;
  if (pageHtml) {
    const unescaped = pageHtml.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const iframeMatch = unescaped.match(/https:\/\/(?:[a-zA-Z0-9-]+\.)?(?:itch\.zone|ssl\.hwcdn\.net)\/html\/\d+\/(?:index\.html)?(?:\?[^"'<>\s]*)?/i);
    if (iframeMatch) {
      iframeUrl = iframeMatch[0];
      if (!iframeUrl.includes('index.html')) {
        iframeUrl = iframeUrl.replace(/\/+$/, '') + '/index.html';
      }
    } else {
      const dataIframeMatch = pageHtml.match(/data-iframe="([^"]+)"/i);
      if (dataIframeMatch) {
        const decoded = dataIframeMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const srcMatch = decoded.match(/src="([^"]+)"/i);
        if (srcMatch) iframeUrl = srcMatch[1];
      }
    }
  }

  if (iframeUrl) {
    sendEvent('log', { level: 'info', message: `🎯 Found embedded HTML5 player: ${iframeUrl}` });
    sendEvent('log', { level: 'info', message: '📥 Ripping game bundle & assets (scripts, WASM, audio, textures)...' });

    const ripResult = await ripHtml5GameFromIndexUrl(
      iframeUrl,
      targetGameDir,
      (msg) => sendEvent('log', { level: 'info', message: msg }),
      (curr, total) => {
        const pct = Math.round((curr / total) * 100);
        sendEvent('download_progress', { current: curr, total, percent: pct });
      }
    );

    const found = findEntryHtml(targetGameDir);
    if (found) {
      sendEvent('log', { level: 'success', message: `✅ Ripped ${ripResult.downloadedCount} game file(s) into local storage.` });
      return {
        entryRelPath: found,
        meta: pageMeta,
        fileCount: ripResult.downloadedCount
      };
    }
  }

  // Tier 3: Direct downloadable zip package
  sendEvent('log', { level: 'info', message: '📦 Checking for downloadable web zip package on itch.io...' });
  try {
    const directResult = await downloadGameDirect({
      itchGameUrl: itchUrl,
      downloadDirectory: tempGameDir
    });
    if (directResult && directResult.status && directResult.filePath && directResult.filePath.endsWith('.zip')) {
      sendEvent('log', { level: 'info', message: 'Extracting downloaded game zip archive...' });
      const zip = new AdmZip(directResult.filePath);
      if (!fs.existsSync(targetGameDir)) fs.mkdirSync(targetGameDir, { recursive: true });
      zip.extractAllTo(targetGameDir, true);
      const found = findEntryHtml(targetGameDir);
      if (found) {
        return {
          entryRelPath: found,
          meta: { ...pageMeta, ...(directResult.metaData || {}) },
          fileCount: fs.readdirSync(targetGameDir).length
        };
      }
    }
  } catch (err) {}

  throw new Error('Unable to rip game code from itch.io. Game may be downloadable-only (non-HTML5) or requires a purchase.');
}

// POST /api/admin/import-itchio - Import free HTML5 web games from itch.io via itchio-downloader (Admin Only)
app.post('/api/admin/import-itchio', requireAdmin, async (req, res) => {
  const {
    urls = [],
    url = '',
    defaultCategory = 'Auto',
    autoPickFirstIcon = true
  } = req.body || {};

  let rawLines = [];
  if (Array.isArray(urls) && urls.length > 0) {
    rawLines = urls;
  } else if (url && typeof url === 'string') {
    rawLines = url.split(/[\r\n,]+/);
  }

  const cleanUrls = rawLines
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^https?:\/\//i.test(s));

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one valid itch.io game URL.' });
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

  sendEvent('start', { totalGames: cleanUrls.length });

  const importedGames = [];
  const skippedGames = [];
  const errors = [];
  const existingGames = readGames();

  for (let idx = 0; idx < cleanUrls.length; idx++) {
    const itchUrl = cleanUrls[idx];
    sendEvent('progress', {
      current: idx + 1,
      total: cleanUrls.length,
      url: itchUrl,
      message: `[${idx + 1}/${cleanUrls.length}] Connecting to ${itchUrl}...`
    });
    sendEvent('log', {
      level: 'info',
      message: `[${idx + 1}/${cleanUrls.length}] Processing ${itchUrl}...`
    });

    try {
      const alreadyExists = existingGames.find((g) => {
        if (g.sourceRepo && g.sourceRepo.toLowerCase() === itchUrl.toLowerCase()) return true;
        return false;
      });

      if (alreadyExists) {
        skippedGames.push({
          url: itchUrl,
          title: alreadyExists.title,
          reason: `Already in library as "${alreadyExists.title}"`
        });
        sendEvent('game_skipped', {
          url: itchUrl,
          title: alreadyExists.title,
          reason: 'Already in library'
        });
        sendEvent('log', {
          level: 'warn',
          message: `⏭️ Skipped "${alreadyExists.title}" (already in library)`
        });
        continue;
      }

      const gameId = crypto.randomUUID();
      const targetGameDir = path.join(GAMES_DIR, gameId);
      const tempGameDir = path.join(TMP_DIR, `itch-${gameId}`);
      if (!fs.existsSync(tempGameDir)) fs.mkdirSync(tempGameDir, { recursive: true });

      const ripData = await ripItchGameCode(itchUrl, tempGameDir, targetGameDir, sendEvent);
      const entryRelPath = ripData.entryRelPath;
      const meta = ripData.meta || {};

      try {
        fs.rmSync(tempGameDir, { recursive: true, force: true });
      } catch {}
      const title = meta.title || formatSlugToTitle(meta.name || path.basename(itchUrl));
      const author = meta.authors?.[0]?.name || meta.author || 'itch.io Creator';
      const category = inferCategoryFromItch(title, meta.tags, defaultCategory);

      const existingByTitle = existingGames.find((g) => g.title && isSameGame(g.title, title));
      if (existingByTitle) {
        try {
          fs.rmSync(targetGameDir, { recursive: true, force: true });
        } catch {}
        skippedGames.push({
          title,
          existingTitle: existingByTitle.title,
          url: itchUrl,
          reason: 'Already in library'
        });
        sendEvent('game_skipped', {
          title,
          existingTitle: existingByTitle.title,
          url: itchUrl,
          reason: `Already in library as "${existingByTitle.title}"`
        });
        sendEvent('log', {
          level: 'warn',
          message: `⏭️ Skipped "${title}" (already in library as "${existingByTitle.title}")`
        });
        continue;
      }

      let coverUrl = null;
      if (meta.coverImage) {
        sendEvent('log', { level: 'info', message: `Saving official itch.io cover art for "${title}"...` });
        coverUrl = await downloadAndSaveCover(gameId, [meta.coverImage]);
      }
      if (!coverUrl && autoPickFirstIcon) {
        sendEvent('log', { level: 'info', message: `Searching top web icon for "${title}"...` });
        const iconData = await searchGameIcons(title);
        if (iconData?.results?.length > 0) {
          coverUrl = await downloadAndSaveCover(gameId, [iconData.results[0].thumbnailUrl, iconData.results[0].url]);
        }
      }

      const newGame = {
        id: gameId,
        title,
        category,
        author,
        description: `Imported from itch.io: ${title} by ${author}`,
        sourceType: 'itchio',
        sourceRepo: itchUrl,
        sourceDir: '',
        sourcePath: entryRelPath,
        playUrl: `/uploads/games/${gameId}/${entryRelPath.replace(/\\/g, '/')}`,
        coverUrl,
        createdAt: new Date().toISOString()
      };

      existingGames.unshift(newGame);
      importedGames.push(newGame);

      sendEvent('game_imported', { game: newGame });
      sendEvent('log', {
        level: 'success',
        message: `✅ Successfully imported "${title}" by ${author}!`
      });
    } catch (err) {
      console.error(`Error importing ${itchUrl}:`, err);
      errors.push({ url: itchUrl, error: err.message });
      sendEvent('log', {
        level: 'error',
        message: `❌ Failed to import ${itchUrl}: ${err.message}`
      });
    }
  }

  writeGames(existingGames);

  sendEvent('done', {
    totalImported: importedGames.length,
    totalSkipped: skippedGames.length,
    totalErrors: errors.length,
    importedGames
  });

  if (isStream) {
    res.end();
  } else {
    return res.json({
      success: true,
      totalImported: importedGames.length,
      totalSkipped: skippedGames.length,
      totalErrors: errors.length,
      importedGames,
      skippedGames,
      errors
    });
  }
});

// GET /api/admin/imported-repos - List all repositories with games in the library (Admin Only)
app.get('/api/admin/imported-repos', requireAdmin, (req, res) => {
  const games = readGames();
  const repoMap = new Map();

  for (const game of games) {
    if (!game.sourceRepo) continue;
    const repoKey = game.sourceRepo.trim();
    if (!repoMap.has(repoKey)) {
      repoMap.set(repoKey, {
        repo: repoKey,
        gameCount: 0,
        games: [],
        latestImport: game.createdAt || null
      });
    }
    const entry = repoMap.get(repoKey);
    entry.gameCount++;
    entry.games.push({
      id: game.id,
      title: game.title,
      category: game.category,
      coverUrl: game.coverUrl
    });
    if (game.createdAt && (!entry.latestImport || game.createdAt > entry.latestImport)) {
      entry.latestImport = game.createdAt;
    }
  }

  const result = Array.from(repoMap.values()).sort((a, b) => {
    return (b.latestImport || '').localeCompare(a.latestImport || '');
  });

  res.json({ repos: result });
});

// POST /api/admin/undo-repo - Undo/remove all games uploaded from a specific repository (Admin Only)
app.post('/api/admin/undo-repo', requireAdmin, (req, res) => {
  const { repo = '' } = req.body || {};
  const cleanRepo = String(repo).trim();

  if (!cleanRepo) {
    return res.status(400).json({ error: 'Repository identifier is required.' });
  }

  const games = readGames();
  const lowerTarget = cleanRepo.toLowerCase();
  const matchingGames = games.filter(
    (g) => g.sourceRepo && g.sourceRepo.toLowerCase() === lowerTarget
  );

  if (matchingGames.length === 0) {
    return res.status(404).json({ error: `No games found in library from repository "${cleanRepo}".` });
  }

  // Remove hosted game directories from disk
  for (const g of matchingGames) {
    const targetDir = path.join(GAMES_DIR, g.id);
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete directory for game ${g.id}:`, e.message);
      }
    }
  }

  const remainingGames = games.filter(
    (g) => !g.sourceRepo || g.sourceRepo.toLowerCase() !== lowerTarget
  );
  writeGames(remainingGames);

  res.json({
    success: true,
    removedCount: matchingGames.length,
    repo: cleanRepo,
    removedGameIds: matchingGames.map((g) => g.id)
  });
});

// POST /api/admin/undo-batch - Undo a specific batch of game IDs (Admin Only)
app.post('/api/admin/undo-batch', requireAdmin, (req, res) => {
  const { gameIds = [] } = req.body || {};
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return res.status(400).json({ error: 'Array of gameIds is required.' });
  }

  const idSet = new Set(gameIds);
  const games = readGames();
  const matchingGames = games.filter((g) => idSet.has(g.id));

  for (const g of matchingGames) {
    const targetDir = path.join(GAMES_DIR, g.id);
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete directory for game ${g.id}:`, e.message);
      }
    }
  }

  const remainingGames = games.filter((g) => !idSet.has(g.id));
  writeGames(remainingGames);

  res.json({
    success: true,
    removedCount: matchingGames.length,
    removedGameIds: matchingGames.map((g) => g.id)
  });
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

// POST /api/suggestions - Public: Submit a game suggestion
app.post('/api/suggestions', (req, res) => {
  const { title = '', url = '', reason = '', submitterName = '' } = req.body || {};
  const cleanTitle = String(title || '').trim().slice(0, 100);
  const cleanUrl = String(url || '').trim().slice(0, 300);
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const cleanSubmitter = String(submitterName || '').trim().slice(0, 50) || 'Anonymous Player';

  if (!cleanTitle) {
    return res.status(400).json({ error: 'Game title is required.' });
  }

  const suggestions = readSuggestions();
  const newSuggestion = {
    id: crypto.randomUUID(),
    title: cleanTitle,
    url: cleanUrl || null,
    reason: cleanReason || null,
    submitterName: cleanSubmitter,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  suggestions.unshift(newSuggestion);
  writeSuggestions(suggestions);

  return res.status(201).json({
    success: true,
    message: 'Thank you! Your game suggestion has been received.',
    suggestion: newSuggestion
  });
});

// GET /api/admin/suggestions - Admin Only: List all game suggestions
app.get('/api/admin/suggestions', requireAdmin, (req, res) => {
  const suggestions = readSuggestions();
  return res.json({ suggestions });
});

// PATCH /api/admin/suggestions/:id - Admin Only: Update suggestion status
app.patch('/api/admin/suggestions/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const validStatuses = ['pending', 'added', 'dismissed'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid suggestion status.' });
  }

  const suggestions = readSuggestions();
  const item = suggestions.find((s) => s.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Suggestion not found.' });
  }

  item.status = status;
  item.updatedAt = new Date().toISOString();
  writeSuggestions(suggestions);

  return res.json({ success: true, suggestion: item });
});

// DELETE /api/admin/suggestions/:id - Admin Only: Delete a suggestion
app.delete('/api/admin/suggestions/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const suggestions = readSuggestions();
  const initialLength = suggestions.length;
  const filtered = suggestions.filter((s) => s.id !== id);

  if (filtered.length === initialLength) {
    return res.status(404).json({ error: 'Suggestion not found.' });
  }

  writeSuggestions(filtered);
  return res.json({ success: true, removedId: id });
});

// POST /api/admin/suggestions/clear - Admin Only: Clear dismissed or all suggestions
app.post('/api/admin/suggestions/clear', requireAdmin, (req, res) => {
  const { filter = 'dismissed' } = req.body || {};
  const suggestions = readSuggestions();
  let remaining = [];

  if (filter === 'all') {
    remaining = [];
  } else if (filter === 'resolved') {
    remaining = suggestions.filter((s) => s.status === 'pending');
  } else {
    remaining = suggestions.filter((s) => s.status !== 'dismissed');
  }

  const removedCount = suggestions.length - remaining.length;
  writeSuggestions(remaining);

  return res.json({ success: true, removedCount, suggestions: remaining });
});

function startServer(port) {
  const host = process.env.HOST || '0.0.0.0';
  const server = app.listen(port, host, () => {
    console.log(`ArcadeVault server running at http://${host}:${port}`);
    console.log(`Admin Panel URL: http://${host}:${port}/admin (default user: ${ADMIN_USER})`);
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
