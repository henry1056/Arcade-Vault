# Arcade-Vault

A modern web games portal with instant browser play, automated Google Images icon selection, and an authenticated admin panel.

All Rights Reserved.

---

## 🌟 Features

- **🎮 Playable Web Games**: Run `.html` single-file games or `.zip` web game bundles (Phaser, Godot, Construct, Unity WebGL, or custom JS) right in the browser with full-screen support.
- **⚡ Mass GitHub Repository Importer**:
  - Batch import entire GitHub repositories full of games in seconds.
  - Automatically detects single-game repos or monorepos containing multiple game directories.
  - **Automatic Duplicate Skipping**: Automatically checks your existing library and skips any game you already have (matches title or repository path) without downloading or creating duplicate entries.
  - **Automatic #1 Google Images Icon Selection**: Automatically searches Google Images for `"<game title> icon"` and assigns the top result (#1) hands-free without manual intervention.
  - Real-time streaming progress console and status tracker.
- **🔗 Embed Game URLs**: Option to link and embed games via external URLs.
- **🛡️ Authenticated Admin Panel**:
  - Regular visitors only see the public arcade library and game player.
  - Uploading, mass importing, and deleting games is protected behind admin authentication.
  - Access via `/admin` or the **Admin Access** button in the footer.
  - Default credentials: `admin` / `admin123` (customizable via `ADMIN_USER` and `ADMIN_PASS` env variables).
- **🖼️ Step 2: Select Icon (Single Uploads)**:
  - Automatically queries Google Images for `"<game title> icon"`.
  - Top 5 search results are displayed as selectable radio cards.
  - The chosen icon is downloaded and hosted locally so cover art never breaks.
- **🔍 Instant Search & Filtering**: Filter by title, creator, or genre tags (Arcade, Action, Puzzle, Platformer, Strategy, RPG, Retro).

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/henry1056/arcade-vault.git
   cd arcade-vault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and visit:
   - Public Arcade: [http://localhost:3080](http://localhost:3080)
   - Admin Panel: [http://localhost:3080/admin](http://localhost:3080/admin)

---

## ☁️ Deploying to Cloudflare Pages (Free `*.pages.dev` URL)

You can deploy ArcadeVault directly to Cloudflare Pages connected to your GitHub repository:

1. Log into your **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
2. Navigate to **Compute (Workers & Pages)** > **Create Application** > **Pages** > **Connect to Git**.
3. Select your GitHub repository: `henry1056/arcade-vault`.
4. Configure the build settings:
   - **Project name**: `arcade-vault` (or your preferred name)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: `npm run build` *(or leave blank)*
   - **Build output directory**: `public`
5. Click **Save and Deploy**.

Cloudflare will deploy your site and provide a live URL like `https://arcade-vault.pages.dev`!

---

## 📁 Project Structure

```
arcade-vault/
├── data/
│   └── games.json            # Game library database
├── public/
│   ├── index.html            # Main SPA frontend
│   ├── styles.css            # Dark arcade UI theme & responsive styles
│   └── app.js                # Frontend logic & multi-step upload wizard
├── uploads/
│   ├── games/                # Extracted web game files
│   └── covers/               # Downloaded cover icons
├── .gitignore
├── package.json
├── README.md
└── server.js                 # Express server & API endpoints
```

---

## 🔒 Security & Safe Extraction

- **Path Traversal Protection**: Game `.zip` archives are extracted using strict Zip-Slip defenses, ensuring files cannot extract outside of their isolated directory.
- **Timing-Safe Auth**: Admin authentication uses `crypto.timingSafeEqual` and HTTP-only session cookies.
- **Admin Isolation**: Sensitive APIs (`/api/games` write endpoints, `/api/admin/*`) require admin session authentication.
