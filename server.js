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

  let savedCoverUrl = thumbnailUrl || iconUrl;

  // Try downloading the selected icon locally into /uploads/covers/<id>.jpg
  for (const candidateUrl of [thumbnailUrl, iconUrl].filter(Boolean)) {
    try {
      const imgRes = await fetch(candidateUrl, {
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
          const filename = `${id}-icon${ext}`;
          fs.writeFileSync(path.join(COVERS_DIR, filename), buffer);
          savedCoverUrl = `/uploads/covers/${filename}`;
          break;
        }
      }
    } catch {
      // Try next candidate URL
    }
  }

  game.coverUrl = savedCoverUrl;
  writeGames(games);

  return res.json(game);
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
