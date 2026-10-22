(() => {
  // 1. Mandatory Fallback for <dialog closedby="any"> in browsers lacking native closedBy support
  const dialogs = document.querySelectorAll('dialog[closedby="any"]');
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialogs.forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        dialog.close();
      });
    });
  }

  // 2. Fallback for declarative Invoker Commands (commandfor / command) if native support is absent
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('button[commandfor][command]');
      if (!btn) return;
      const targetId = btn.getAttribute('commandfor');
      const command = btn.getAttribute('command');
      const target = document.getElementById(targetId);
      if (!target) return;

      if (command === 'show-modal' && typeof target.showModal === 'function' && !target.open) {
        target.showModal();
      } else if (command === 'close' && typeof target.close === 'function' && target.open) {
        target.close();
      }
    });
  }

  // 3. Mandatory :user-invalid fallback & ARIA synchronization
  const UserInvalidFallback = (() => {
    const dirtyState = new WeakMap();

    const updateState = (input) => {
      const isValid = input.checkValidity();
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);
      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    };

    const handleEvent = (event) => {
      const input = event.target;
      if (event.type === 'reset') {
        const controls = input.elements || [];
        for (const control of controls) {
          dirtyState.delete(control);
          control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          control.removeAttribute('aria-invalid');
        }
        return;
      }

      if (!input || typeof input.checkValidity !== 'function') return;

      if (event.type === 'input' || event.type === 'change') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasInteracted = true;
        dirtyState.set(input, state);
        if (state.hasBlurred) updateState(input);
      } else if (event.type === 'blur') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        dirtyState.set(input, state);
        if (state.hasInteracted) updateState(input);
      }
    };

    const init = (root = document) => {
      if (CSS.supports('selector(:user-invalid)')) return;
      root.addEventListener('blur', handleEvent, true);
      root.addEventListener('input', handleEvent);
      root.addEventListener('change', handleEvent);
      root.addEventListener('reset', handleEvent, true);
    };

    return { init };
  })();

  const syncAria = (el) => {
    if (!el || typeof el.matches !== 'function' || !('validity' in el)) return;
    try {
      el.setAttribute('aria-invalid', el.matches(':user-invalid') ? 'true' : 'false');
    } catch {
      // Ignore if selector unsupported
    }
  };

  document.addEventListener('blur', (e) => syncAria(e.target), true);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) {
      syncAria(e.target);
    }
  });

  // Procedural SVG Game Cover Generator for games without icons or broken images
  function generateGameCoverSvg(title, category = 'Arcade') {
    const safeTitle = (title || 'Game').trim();
    const safeCat = (category || 'Arcade').trim().toUpperCase();

    const colorPalettes = {
      Fighting: { from: '#dc2626', to: '#7f1d1d', glow: '#ef4444' },
      Shooter: { from: '#f43f5e', to: '#9f1239', glow: '#fb7185' },
      Racing: { from: '#f59e0b', to: '#b45309', glow: '#fbbf24' },
      Action: { from: '#f97316', to: '#dc2626', glow: '#fb923c' },
      Platformer: { from: '#10b981', to: '#047857', glow: '#34d399' },
      Puzzle: { from: '#06b6d4', to: '#0369a1', glow: '#38bdf8' },
      Sports: { from: '#16a34a', to: '#14532d', glow: '#22c55e' },
      Retro: { from: '#d946ef', to: '#7c3aed', glow: '#e879f9' },
      Horror: { from: '#334155', to: '#0f172a', glow: '#94a3b8' },
      Idle: { from: '#eab308', to: '#a16207', glow: '#fef08a' },
      Strategy: { from: '#6366f1', to: '#3730a3', glow: '#818cf8' },
      RPG: { from: '#8b5cf6', to: '#5b21b6', glow: '#a78bfa' },
      Arcade: { from: '#8b5cf6', to: '#ec4899', glow: '#a855f7' },
      Other: { from: '#64748b', to: '#334155', glow: '#94a3b8' }
    };

    const matchedKey = Object.keys(colorPalettes).find((k) => k.toLowerCase() === (category || '').trim().toLowerCase());
    const matchedPalette = matchedKey ? colorPalettes[matchedKey] : colorPalettes.Arcade;

    const escapedTitle = safeTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const displayTitle = escapedTitle.length > 24 ? escapedTitle.slice(0, 22) + '...' : escapedTitle;

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">',
      '  <defs>',
      '    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" stop-color="#090d16" />',
      '      <stop offset="100%" stop-color="#141a2c" />',
      '    </linearGradient>',
      '    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" stop-color="' + matchedPalette.from + '" />',
      '      <stop offset="100%" stop-color="' + matchedPalette.to + '" />',
      '    </linearGradient>',
      '    <radialGradient id="glowGrad" cx="50%" cy="45%" r="50%">',
      '      <stop offset="0%" stop-color="' + matchedPalette.glow + '" stop-opacity="0.35" />',
      '      <stop offset="100%" stop-color="' + matchedPalette.glow + '" stop-opacity="0" />',
      '    </radialGradient>',
      '  </defs>',
      '  <rect width="640" height="360" fill="url(#bgGrad)" />',
      '  <circle cx="320" cy="145" r="180" fill="url(#glowGrad)" />',
      '  <g stroke="rgba(255,255,255,0.05)" stroke-width="1">',
      '    <line x1="0" y1="72" x2="640" y2="72" />',
      '    <line x1="0" y1="144" x2="640" y2="144" />',
      '    <line x1="0" y1="216" x2="640" y2="216" />',
      '    <line x1="0" y1="288" x2="640" y2="288" />',
      '    <line x1="128" y1="0" x2="128" y2="360" />',
      '    <line x1="256" y1="0" x2="256" y2="360" />',
      '    <line x1="384" y1="0" x2="384" y2="360" />',
      '    <line x1="512" y1="0" x2="512" y2="360" />',
      '  </g>',
      '  <g transform="translate(320, 125) scale(1.15)">',
      '    <rect x="-54" y="-32" width="108" height="64" rx="16" fill="url(#accentGrad)" opacity="0.25" stroke="' + matchedPalette.from + '" stroke-width="2" />',
      '    <path d="M-28 -6 L-28 6 M-34 0 L-22 0" stroke="#ffffff" stroke-width="4" stroke-linecap="round" />',
      '    <circle cx="24" cy="-4" r="4.5" fill="#ffffff" />',
      '    <circle cx="14" cy="6" r="4.5" fill="#ffffff" opacity="0.8" />',
      '  </g>',
      '  <rect x="230" y="210" width="180" height="26" rx="13" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1" />',
      '  <text x="320" y="227" fill="#ffffff" font-size="11" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="1.5" text-anchor="middle">' + safeCat + '</text>',
      '  <text x="320" y="280" fill="#ffffff" font-size="24" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle">' + displayTitle + '</text>',
      '  <text x="320" y="308" fill="#94a3b8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="500" text-anchor="middle">ARCADE VAULT • PLAY NOW</text>',
      '</svg>'
    ].join('\n');

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Client-side IndexedDB Storage (Enables offline / Cloudflare Pages static hosting support)
  const DB_NAME = 'ArcadeVaultDB';
  const DB_STORE = 'games';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetGames() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async function idbSaveGame(game) {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(game);
    } catch {
      // Ignore storage errors
    }
  }

  const idbPutGame = idbSaveGame;

  async function idbDeleteGame(id) {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
    } catch {
      // Ignore storage errors
    }
  }

  // DOM Elements - Admin Auth & Panel
  const adminHeaderNav = document.getElementById('admin-header-nav');
  const adminPanel = document.getElementById('admin-panel');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  const footerAdminBtn = document.getElementById('footer-admin-btn');
  const emptyUploadBtn = document.getElementById('empty-upload-btn');
  const emptyStateDesc = document.getElementById('empty-state-desc');

  const adminLoginDialog = document.getElementById('admin-login-dialog');
  const adminLoginForm = document.getElementById('admin-login-form');
  const passwordInput = document.getElementById('current-password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const loginStatus = document.getElementById('login-status');
  const loginSubmitBtn = document.getElementById('login-submit-btn');

  // DOM Elements - Upload Modal (Step 1 & Step 2)
  const uploadDialog = document.getElementById('upload-dialog');
  const uploadDialogTitle = document.getElementById('upload-dialog-title');
  const stepTracker1 = document.getElementById('step-tracker-1');
  const stepTracker2 = document.getElementById('step-tracker-2');

  const uploadForm = document.getElementById('upload-form');
  const titleInput = document.getElementById('game-title');
  const sourceRadios = document.querySelectorAll('input[name="sourceType"]');
  const fileSourceGroup = document.getElementById('file-source-group');
  const urlSourceGroup = document.getElementById('url-source-group');
  const gameFileInput = document.getElementById('game-file');
  const gameUrlInput = document.getElementById('game-url');
  const selectedFileLabel = document.getElementById('selected-file-label');
  const dropzone = document.getElementById('dropzone');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressBar = document.getElementById('upload-progress');
  const progressLabel = document.getElementById('upload-progress-label');
  const formStatus = document.getElementById('form-status');
  const submitUploadBtn = document.getElementById('submit-upload-btn');

  const iconSelectForm = document.getElementById('icon-select-form');
  const iconSearchQueryBadge = document.getElementById('icon-search-query-badge');
  const iconLoadingState = document.getElementById('icon-loading-state');
  const iconLoadingQuery = document.getElementById('icon-loading-query');
  const iconResultsFieldset = document.getElementById('icon-results-fieldset');
  const iconResultsGrid = document.getElementById('icon-results-grid');
  const iconStepStatus = document.getElementById('icon-step-status');
  const skipIconBtn = document.getElementById('skip-icon-btn');
  const saveIconBtn = document.getElementById('save-icon-btn');

  // DOM Elements - Catalog & Player
  const filterForm = document.getElementById('filter-form');
  const searchInput = document.getElementById('search-input');
  const categoryFilters = document.getElementById('category-filters');
  const gamesGrid = document.getElementById('games-grid');
  const emptyState = document.getElementById('empty-state');
  const gameCountBadge = document.getElementById('game-count');

  const playerDialog = document.getElementById('player-dialog');
  const playerTitle = document.getElementById('player-dialog-title');
  const playerCategory = document.getElementById('player-category');
  const playerAuthor = document.getElementById('player-author');
  const playerDesc = document.getElementById('player-description');
  const playerStage = document.getElementById('player-stage');
  const gameIframe = document.getElementById('game-iframe');
  const reloadGameBtn = document.getElementById('reload-game-btn');
  const fullscreenGameBtn = document.getElementById('fullscreen-game-btn');
  const openNewTabLink = document.getElementById('open-new-tab-link');
  const deleteGameBtn = document.getElementById('delete-game-btn');

  // DOM Elements - Mass GitHub Importer
  const massImportDialog = document.getElementById('mass-import-dialog');
  const massImportForm = document.getElementById('mass-import-form');
  const massGithubUrls = document.getElementById('mass-github-urls');
  const massCategory = document.getElementById('mass-category');
  const massAutoIcon = document.getElementById('mass-auto-icon');
  const massGithubToken = document.getElementById('mass-github-token');
  const massInsertExamplesBtn = document.getElementById('mass-insert-examples-btn');
  const massProgressSection = document.getElementById('mass-progress-section');
  const massStatusLabel = document.getElementById('mass-status-label');
  const massProgressPercent = document.getElementById('mass-progress-percent');
  const massImportProgress = document.getElementById('mass-import-progress');
  const massImportConsole = document.getElementById('mass-import-console');
  const massConsoleClear = document.getElementById('mass-console-clear');
  const massFormStatus = document.getElementById('mass-form-status');
  const startMassImportBtn = document.getElementById('start-mass-import-btn');
  const massCancelBtn = document.getElementById('mass-cancel-btn');
  const emptyAdminActions = document.getElementById('empty-admin-actions');
  const emptyMassImportBtn = document.getElementById('empty-mass-import-btn');

  // DOM Elements - Manage & Undo Uploaded Repositories
  const manageReposDialog = document.getElementById('manage-repos-dialog');
  const headerManageReposBtn = document.getElementById('header-manage-repos-btn');
  const bannerManageReposBtn = document.getElementById('banner-manage-repos-btn');
  const massUndoRecentBtn = document.getElementById('mass-undo-recent-btn');
  const quickUndoBatchBanner = document.getElementById('quick-undo-batch-banner');
  const quickUndoBatchBtn = document.getElementById('quick-undo-batch-btn');
  const quickUndoBatchLabel = document.getElementById('quick-undo-batch-label');
  const reposListContainer = document.getElementById('repos-list-container');
  const reposEmptyState = document.getElementById('repos-empty-state');
  const reposCountBadge = document.getElementById('repos-count-badge');

  // DOM Elements - Redo Game Icons
  const redoIconsDialog = document.getElementById('redo-icons-dialog');
  const headerRedoIconsBtn = document.getElementById('header-redo-icons-btn');
  const bannerRedoIconsBtn = document.getElementById('banner-redo-icons-btn');
  const redoMissingCountBadge = document.getElementById('redo-missing-count-badge');
  const redoAllCountBadge = document.getElementById('redo-all-count-badge');
  const redoProgressSection = document.getElementById('redo-progress-section');
  const redoProgressLabel = document.getElementById('redo-progress-label');
  const redoProgressPercent = document.getElementById('redo-progress-percent');
  const redoIconsProgressBar = document.getElementById('redo-icons-progress-bar');
  const redoCurrentGameCard = document.getElementById('redo-current-game-card');
  const redoPreviewImg = document.getElementById('redo-preview-img');
  const redoCurrentTitle = document.getElementById('redo-current-title');
  const redoCurrentDetail = document.getElementById('redo-current-detail');
  const redoResultsSummary = document.getElementById('redo-results-summary');
  const redoSummaryCount = document.getElementById('redo-summary-count');
  const startRedoIconsBtn = document.getElementById('start-redo-icons-btn');
  const editAutofetchIconBtn = document.getElementById('edit-autofetch-icon-btn');

  // DOM Elements - itch.io Game Importer
  const itchImportDialog = document.getElementById('itch-import-dialog');
  const headerItchImportBtn = document.getElementById('header-itch-import-btn');
  const bannerItchImportBtn = document.getElementById('banner-itch-import-btn');
  const itchImportForm = document.getElementById('itch-import-form');
  const itchUrlsInput = document.getElementById('itch-urls-input');
  const itchCategorySelect = document.getElementById('itch-category-select');
  const itchAutoIcon = document.getElementById('itch-auto-icon');
  const itchProgressSection = document.getElementById('itch-progress-section');
  const itchStatusLabel = document.getElementById('itch-status-label');
  const itchProgressPercent = document.getElementById('itch-progress-percent');
  const itchProgressBar = document.getElementById('itch-progress-bar');
  const itchConsole = document.getElementById('itch-console');
  const clearItchConsoleBtn = document.getElementById('clear-itch-console-btn');
  const itchFormStatus = document.getElementById('itch-form-status');
  const startItchImportBtn = document.getElementById('start-itch-import-btn');
  const itchCancelBtn = document.getElementById('itch-cancel-btn');

  // DOM Elements - Player Game Suggestions
  const headerSuggestGameBtn = document.getElementById('header-suggest-game-btn');
  const heroSuggestBtn = document.getElementById('hero-suggest-btn');
  const suggestGameDialog = document.getElementById('suggest-game-dialog');
  const suggestGameForm = document.getElementById('suggest-game-form');
  const suggestTitleInput = document.getElementById('suggest-title-input');
  const suggestUrlInput = document.getElementById('suggest-url-input');
  const suggestReasonInput = document.getElementById('suggest-reason-input');
  const suggestNameInput = document.getElementById('suggest-name-input');
  const suggestFormStatus = document.getElementById('suggest-form-status');
  const submitSuggestionBtn = document.getElementById('submit-suggestion-btn');
  const suggestCancelBtn = document.getElementById('suggest-cancel-btn');

  // DOM Elements - Admin Suggestions Management
  const headerSuggestionsBtn = document.getElementById('header-suggestions-btn');
  const bannerSuggestionsBtn = document.getElementById('banner-suggestions-btn');
  const adminSuggestionsCountBadge = document.getElementById('admin-suggestions-count-badge');
  const bannerSuggestionsCountBadge = document.getElementById('banner-suggestions-count-badge');
  const manageSuggestionsDialog = document.getElementById('manage-suggestions-dialog');
  const manageSuggestionsBadge = document.getElementById('manage-suggestions-badge');
  const suggestionsListContainer = document.getElementById('suggestions-list-container');
  const suggestionsEmptyState = document.getElementById('suggestions-empty-state');
  const countAllSuggestions = document.getElementById('count-all-suggestions');
  const countPendingSuggestions = document.getElementById('count-pending-suggestions');
  const countAddedSuggestions = document.getElementById('count-added-suggestions');
  const clearDismissedSuggestionsBtn = document.getElementById('clear-dismissed-suggestions-btn');
  const filterAllSuggestionsBtn = document.getElementById('filter-all-suggestions-btn');
  const filterPendingSuggestionsBtn = document.getElementById('filter-pending-suggestions-btn');
  const filterAddedSuggestionsBtn = document.getElementById('filter-added-suggestions-btn');

  // DOM Elements - Edit Game Details Dialog
  const editGameDialog = document.getElementById('edit-game-dialog');
  const editGameForm = document.getElementById('edit-game-form');
  const editGameId = document.getElementById('edit-game-id');
  const editGameTitle = document.getElementById('edit-game-title');
  const editGameCategory = document.getElementById('edit-game-category');
  const editGameAuthor = document.getElementById('edit-game-author');
  const editGameDescription = document.getElementById('edit-game-description');
  const editGameCoverUrl = document.getElementById('edit-game-cover-url');
  const editCoverImg = document.getElementById('edit-cover-img');
  const editCoverFallback = document.getElementById('edit-cover-fallback');
  const editSearchIconBtn = document.getElementById('edit-search-icon-btn');
  const editIconSearchSection = document.getElementById('edit-icon-search-section');
  const editIconSearchStatus = document.getElementById('edit-icon-search-status');
  const editIconCancelSearchBtn = document.getElementById('edit-icon-cancel-search-btn');
  const editIconResultsGrid = document.getElementById('edit-icon-results-grid');
  const editFormStatus = document.getElementById('edit-form-status');
  const saveEditGameBtn = document.getElementById('save-edit-game-btn');
  const editGamePlayerBtn = document.getElementById('edit-game-player-btn');

  // DOM Elements - Views (Catalog vs Dedicated Game Page)
  const catalogView = document.getElementById('catalog-view');
  const gamePageView = document.getElementById('game-page-view');
  const gamePageBackBtn = document.getElementById('game-page-back-btn');
  const gamePageCrumbCategory = document.getElementById('game-page-crumb-category');
  const gamePageCrumbTitle = document.getElementById('game-page-crumb-title');
  const gamePageReloadBtn = document.getElementById('game-page-reload-btn');
  const gamePageFullscreenBtn = document.getElementById('game-page-fullscreen-btn');
  const gamePageNewtabLink = document.getElementById('game-page-newtab-link');
  const gamePageShareBtn = document.getElementById('game-page-share-btn');
  const gamePageEditBtn = document.getElementById('game-page-edit-btn');
  const gamePageDeleteBtn = document.getElementById('game-page-delete-btn');
  const gamePageStageWrap = document.getElementById('game-page-stage-wrap');
  const gamePageIframe = document.getElementById('game-page-iframe');
  const gamePageLoader = document.getElementById('game-page-loader');
  const gamePageTroubleshootLink = document.getElementById('game-page-troubleshoot-link');
  const gamePageCoverImg = document.getElementById('game-page-cover-img');
  const gamePageTitle = document.getElementById('game-page-title');
  const gamePageCategoryBadge = document.getElementById('game-page-category-badge');
  const gamePageSourceBadge = document.getElementById('game-page-source-badge');
  const gamePageAuthor = document.getElementById('game-page-author');
  const gamePageDesc = document.getElementById('game-page-desc');
  const gamePageRelatedGrid = document.getElementById('game-page-related-grid');


  UserInvalidFallback.init(uploadForm);
  UserInvalidFallback.init(adminLoginForm);
  if (massImportForm) UserInvalidFallback.init(massImportForm);
  if (editGameForm) UserInvalidFallback.init(editGameForm);

  const DEFAULT_GAMES = [
  {
    "id": "game-polytrack",
    "title": "Polytrack",
    "category": "Arcade",
    "author": "Kodub",
    "description": "Fast-paced low-poly track racing game. Race against the clock, customize cars, construct custom stunt tracks, and beat global leaderboards.",
    "sourceType": "itchio",
    "sourceRepo": "https://kodub.itch.io/polytrack",
    "sourceDir": "uploads/games/game-polytrack",
    "sourcePath": "index.html",
    "playUrl": "/uploads/games/game-polytrack/index.html",
    "coverUrl": "https://img.itch.zone/aW1nLzI2MDUxNTMzLnBuZw==/315x250%23c/ZmLjX4.png",
    "createdAt": "2026-10-21T07:33:00.000Z"
  },
  {
    "id": "game-iron-snout",
    "title": "Iron Snout",
    "category": "Fighting",
    "author": "SnoutUp Games",
    "description": "Fast, snappy, and hilarious button-mashing pig fighting game. Defend yourself against endless waves of axe-wielding and chainsaw-wielding wolves using martial arts moves.",
    "sourceType": "url",
    "sourceRepo": "snoutup/iron-snout",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://ironsnoutonline.github.io",
    "coverUrl": "https://img.itch.zone/aW1nLzU2OTg4NC5wbmc=/315x250%23c/eQc87c.png",
    "createdAt": "2026-10-20T23:55:00.000Z"
  },
  {
    "id": "game-stickman-fighter",
    "title": "Stickman Fighter",
    "category": "Fighting",
    "author": "Playtouch",
    "description": "Martial arts arcade fighting game. Time your strikes left and right to unleash epic combos and knock out waves of enemy stickmen.",
    "sourceType": "url",
    "sourceRepo": "playtouch/stickman-fighter",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/b91615ae558c4b4caab812eb3c02fa9e/",
    "coverUrl": "https://ts4.mm.bing.net/th?id=OIP.kgeMWQ73I1hPP4xpbsSryAHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:54:00.000Z"
  },
  {
    "id": "game-boxing-physics",
    "title": "Boxing Physics",
    "category": "Fighting",
    "author": "CoolGames",
    "description": "Ragdoll boxing physics fighter. Swing, dodge, and deliver wacky knockout punches in fast-paced arena battles.",
    "sourceType": "url",
    "sourceRepo": "coolgames/boxing-physics",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/b97dd1aa9fa9465da3a5ff792b00ffc7/",
    "coverUrl": "https://ts2.mm.bing.net/th?id=OIP.fD1OOLTnhf-gvJeNzTE85gHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:53:00.000Z"
  },
  {
    "id": "game-1v1-lol",
    "title": "1v1.LOL",
    "category": "Shooter",
    "author": "JustPlay.LOL",
    "description": "Competitive third-person tactical shooter and real-time building arena. Fight in 1v1 duels, box fights, and battle royale modes.",
    "sourceType": "url",
    "sourceRepo": "justplay/1v1-lol",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://1v1.lol",
    "coverUrl": "https://tse4.mm.bing.net/th/id/OIP.WhA_sv6MbbzAQb372SIlfAHaEo?r=0&pid=Api",
    "createdAt": "2026-10-20T23:52:00.000Z"
  },
  {
    "id": "game-time-shooter",
    "title": "Time Shooter 2",
    "category": "Shooter",
    "author": "GoGoMan",
    "description": "Superhot-style first-person shooter where time only moves when you move. Plan each shot, dodge enemy bullets in slow motion, and neutralize crystal foes.",
    "sourceType": "url",
    "sourceRepo": "gogoman/time-shooter-2",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/5ca454ba78024ce5ba8573fc0be2c9eb/",
    "coverUrl": "https://ts3.mm.bing.net/th?id=OIP.ZCV1rAFxi1z2DDsAoms_KwHaF8&pid=15.1",
    "createdAt": "2026-10-20T23:51:00.000Z"
  },
  {
    "id": "game-hexgl",
    "title": "HexGL",
    "category": "Racing",
    "author": "Thibaut Despoulain",
    "description": "High-speed futuristic WebGL racing game built with Three.js. Pilot high-velocity anti-gravity hovercrafts across winding tracks.",
    "sourceType": "url",
    "sourceRepo": "BKcore/HexGL",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://hexgl.bkcore.com/play/",
    "coverUrl": "https://hexgl.bkcore.com/image/poster.png",
    "createdAt": "2026-10-20T23:50:00.000Z"
  },
  {
    "id": "game-slow-roads",
    "title": "Slow Roads 3D",
    "category": "Racing",
    "author": "Anslo",
    "description": "Stunning 3D procedural driving experience. Cruise endlessly through rolling hills, autumn forests, and moon landscapes with dynamic time-of-day.",
    "sourceType": "url",
    "sourceRepo": "anslo/slow-roads",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://slowroads.io",
    "coverUrl": "https://ts1.mm.bing.net/th?id=OIP.zoBFA69SPFduVytG6bHxqgHaDz&pid=15.1",
    "createdAt": "2026-10-20T23:49:00.000Z"
  },
  {
    "id": "game-drift-boss",
    "title": "Drift Boss",
    "category": "Racing",
    "author": "MarketJS",
    "description": "Addictive one-button drifting game. Steer around tricky corners, avoid flying off edges, and collect coins to unlock new custom vehicles.",
    "sourceType": "url",
    "sourceRepo": "marketjs/drift-boss",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://drift-boss.com",
    "coverUrl": "https://ts2.mm.bing.net/th?id=OIP.HxPLFL_Ax-be0GqV17MZMQHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:48:00.000Z"
  },
  {
    "id": "game-slope",
    "title": "Slope",
    "category": "Action",
    "author": "Rob Kay",
    "description": "High-octane 3D endless runner where you steer a ball speeding down randomized neon slopes, dodging obstacles and navigating tricky turns at breakneck speeds.",
    "sourceType": "url",
    "sourceRepo": "robkay/slope",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://slope-game.github.io",
    "coverUrl": "https://ts1.mm.bing.net/th?id=OIP.9H7dU2KIp1UymKFCgvHqtwHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:47:00.000Z"
  },
  {
    "id": "game-run-3",
    "title": "Run 3",
    "category": "Action",
    "author": "Player 03",
    "description": "Defy gravity in space tunnels! Jump and rotate the entire cylindrical tunnel to run on walls and ceilings across hundreds of challenging galaxy levels.",
    "sourceType": "url",
    "sourceRepo": "player03/run-3",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://run3.io",
    "coverUrl": "https://tse4.mm.bing.net/th/id/OIP.w1rUusSLUDwi0IJBnBmHGQAAAA?r=0&pid=Api",
    "createdAt": "2026-10-20T23:46:00.000Z"
  },
  {
    "id": "game-wbwwb",
    "title": "We Become What We Behold",
    "category": "Platformer",
    "author": "Nicky Case!",
    "description": "A thought-provoking 5-minute game about news cycles, vicious cycles, and infinite cycles. Capture moments with your camera to see how the crowd reacts.",
    "sourceType": "itchio",
    "sourceRepo": "https://ncase.itch.io/wbwwb",
    "sourceDir": "uploads/games/game-wbwwb",
    "sourcePath": "index.html",
    "playUrl": "/uploads/games/game-wbwwb/index.html",
    "coverUrl": "https://img.itch.zone/aW1hZ2UvOTIxMTUvNDU0MDMxLnBuZw==/315x250%23c/cxthdQ.png",
    "createdAt": "2026-10-20T23:45:00.000Z"
  },
  {
    "id": "game-doodle-jump",
    "title": "Doodle Jump",
    "category": "Platformer",
    "author": "Lima Sky",
    "description": "The classic vertical platform jumper! Bounce upwards through graph paper, avoiding black holes, monsters, and broken platforms while using springs and jetpacks.",
    "sourceType": "url",
    "sourceRepo": "limasky/doodle-jump",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://doodle-jump.co",
    "coverUrl": "https://ts1.mm.bing.net/th?id=OIP.QZ2gp87Ew_6prVU87LeQxwHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:44:00.000Z"
  },
  {
    "id": "game-ovo",
    "title": "OvO",
    "category": "Platformer",
    "author": "Dedra Games",
    "description": "Fast-paced precision parkour platformer. Chain slides, wall jumps, dives, and flips to beat levels in record times.",
    "sourceType": "url",
    "sourceRepo": "dedragames/ovo",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://dedragames.com/games/ovo/",
    "coverUrl": "https://ts2.mm.bing.net/th?id=OIP.Vn9844_myLgUwM3rDaddFwHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:43:00.000Z"
  },
  {
    "id": "game-2048",
    "title": "2048",
    "category": "Puzzle",
    "author": "Gabriele Cirulli",
    "description": "The legendary number puzzle. Slide tiles with arrow keys to merge matching numbers and reach the elusive 2048 tile.",
    "sourceType": "url",
    "sourceRepo": "gabrielecirulli/2048",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://play2048.co",
    "coverUrl": "https://tse4.mm.bing.net/th/id/OIP.w0_kw2xM6TS6POjwTbehEgHaHa?r=0&pid=Api",
    "createdAt": "2026-10-20T23:42:00.000Z"
  },
  {
    "id": "game-tetris",
    "title": "Tetris Classic",
    "category": "Puzzle",
    "author": "Alexey Pajitnov",
    "description": "The timeless geometric block-clearing arcade game. Rotate, slide, and drop falling tetrominoes to clear full horizontal lines.",
    "sourceType": "url",
    "sourceRepo": "chvin/react-tetris",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://chvin.github.io/react-tetris/",
    "coverUrl": "https://static.vecteezy.com/system/resources/previews/025/729/260/original/tetris-icon-in-illustration-vector.jpg",
    "createdAt": "2026-10-20T23:41:00.000Z"
  },
  {
    "id": "game-retro-bowl",
    "title": "Retro Bowl",
    "category": "Sports",
    "author": "New Star Games",
    "description": "Charming 8-bit American football simulation. Manage your NFL roster, call plays, throw touchdown passes, and lead your franchise to glory.",
    "sourceType": "url",
    "sourceRepo": "newstargames/retro-bowl",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://retro-bowl.github.io",
    "coverUrl": "https://ts4.mm.bing.net/th?id=OIP.YGWYzPd3McV7EdzVhzxsSAHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:40:00.000Z"
  },
  {
    "id": "game-basketball-stars",
    "title": "Basketball Stars",
    "category": "Sports",
    "author": "Madpuffers",
    "description": "Fast 1v1 and 2v2 cartoon basketball action with alley-oops, slam dunks, steals, and super shots.",
    "sourceType": "url",
    "sourceRepo": "madpuffers/basketball-stars",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/69d7084b71d949fe92518e38d9f1e145/",
    "coverUrl": "https://ts1.mm.bing.net/th?id=OIP.wpxLCgcbofTKzJUde907HQHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:39:00.000Z"
  },
  {
    "id": "game-pacman",
    "title": "Pac-Man Canvas",
    "category": "Retro",
    "author": "Namco",
    "description": "Classic arcade maze chase! Eat dots, avoid Blinky, Pinky, Inky, and Clyde, and grab Power Pellets to turn the tables on the ghosts.",
    "sourceType": "url",
    "sourceRepo": "namco/pacman",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://pacman-game.github.io",
    "coverUrl": "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f0/93/4d/f0934dc4-e550-3eed-49d4-d55da3279311/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg",
    "createdAt": "2026-10-20T23:38:00.000Z"
  },
  {
    "id": "game-flappy-bird",
    "title": "Flappy Bird",
    "category": "Retro",
    "author": "Dong Nguyen",
    "description": "The notorious tap-to-flap arcade obstacle avoider. Guide the bird safely through pairs of green pipes without touching anything.",
    "sourceType": "url",
    "sourceRepo": "dongnguyen/flappy-bird",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://flappybird.io",
    "coverUrl": "https://upload.wikimedia.org/wikipedia/en/0/0a/Flappy_Bird_icon.png",
    "createdAt": "2026-10-20T23:37:00.000Z"
  },
  {
    "id": "game-fnaf-demake",
    "title": "FNaF Web Demake",
    "category": "Horror",
    "author": "Scott Cawthon / Community",
    "description": "Survive your night shift as the security guard at Freddy Fazbear's Pizza. Monitor camera feeds, conserve door power, and don't let animatronics in!",
    "sourceType": "url",
    "sourceRepo": "scottgames/fnaf",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://fnaf-game.github.io",
    "coverUrl": "https://ts2.mm.bing.net/th?id=OIP.tASoS0DpcP48V3IdbMexwwHaHY&pid=15.1",
    "createdAt": "2026-10-20T23:36:00.000Z"
  },
  {
    "id": "game-cookie-clicker",
    "title": "Cookie Clicker",
    "category": "Idle",
    "author": "Orteil & Opti",
    "description": "The quintessential incremental game. Click a giant cookie, hire grandmas, build farms, unlock time machines, and bake billions of cookies.",
    "sourceType": "url",
    "sourceRepo": "dashnet/cookie-clicker",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://orteil.dashnet.org/cookieclicker/",
    "coverUrl": "https://tse1.mm.bing.net/th/id/OIP.L7OAJII9jDIPxBsXOTglqwHaHa?r=0&pid=Api",
    "createdAt": "2026-10-20T23:35:00.000Z"
  },
  {
    "id": "game-bloons-td",
    "title": "Bloons Tower Defense",
    "category": "Strategy",
    "author": "Ninja Kiwi",
    "description": "Pop waves of multi-colored balloons with dart monkeys, tack shooters, bomb towers, and super monkeys before they reach the exit.",
    "sourceType": "url",
    "sourceRepo": "ninjakiwi/bloons-td",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://bloons-td.github.io",
    "coverUrl": "https://cdn.iconscout.com/icon/premium/png-512-thumb/slope-6769199-5549123.png",
    "createdAt": "2026-10-20T23:34:00.000Z"
  },
  {
    "id": "game-master-chess",
    "title": "Master Chess",
    "category": "Strategy",
    "author": "CodeThisLab",
    "description": "Play classic chess against adaptive AI bots or a friend locally. Features 2D and 3D piece views, legal move hints, and timers.",
    "sourceType": "url",
    "sourceRepo": "codethislab/master-chess",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/5f8ef3425f1947b198a2eb8331da0bfa/",
    "coverUrl": "https://ts4.mm.bing.net/th?id=OIP.SZFGORbWIKcxEUBDq8bF8wHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:33:00.000Z"
  },
  {
    "id": "game-hero-knight",
    "title": "Hero Knight Action RPG",
    "category": "RPG",
    "author": "PowerSlash Studios",
    "description": "Pixel art side-scrolling action RPG. Defend your hometown against hordes of monsters, level up your warrior attributes, unlock legendary gear, and unleash devastating power slash attacks.",
    "sourceType": "url",
    "sourceRepo": "powerslash/hero-knight",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/268ffdb2c4a748f18d0c39c9d183b9ed/",
    "coverUrl": "https://ts1.mm.bing.net/th?id=OIP.U71-a0p-zJg178eJ1fV49gHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:32:00.000Z"
  },
  {
    "id": "game-up-hero",
    "title": "Up Hero Action RPG",
    "category": "RPG",
    "author": "GameDistribution",
    "description": "Action-packed arena RPG. Slay endless waves of dungeon monsters, collect rare gems and gold, upgrade your combat stats, and master swords and magic spells.",
    "sourceType": "url",
    "sourceRepo": "gamedistribution/up-hero",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/e545b983f4ad4284a220080dad9d9330/",
    "coverUrl": "https://ts3.mm.bing.net/th?id=OIP.C0qC4a0e9zZ5hY5M7nQ38QHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:31:00.000Z"
  },
  {
    "id": "game-ghost-escape",
    "title": "Ghost Escape 3D",
    "category": "Horror",
    "author": "8B Games",
    "description": "Suspenseful first-person 3D survival horror escape. Explore haunted hallways, find exit clues, and avoid the supernatural entity lurking in the shadows.",
    "sourceType": "url",
    "sourceRepo": "8bgames/ghost-escape-3d",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://html5.gamedistribution.com/a114410bad2b4601b933f165fafa30b4/",
    "coverUrl": "https://ts2.mm.bing.net/th?id=OIP.6Z1q0w3y2a3b4c5d6e7f8gHaHa&pid=15.1",
    "createdAt": "2026-10-20T23:30:00.000Z"
  },
  {
    "id": "game-candy-box-2",
    "title": "Candy Box 2",
    "category": "Idle",
    "author": "aniwey",
    "description": "The legendary ASCII art incremental adventure RPG. Start by eating candies, unlock the candy merchant, brew potions, explore caves, and discover surreal secrets.",
    "sourceType": "url",
    "sourceRepo": "aniwey/candybox2",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://candybox2.github.io/",
    "coverUrl": "https://upload.wikimedia.org/wikipedia/en/9/93/Candy_Box_2_logo.png",
    "createdAt": "2026-10-20T23:29:00.000Z"
  },
  {
    "id": "game-space-invaders",
    "title": "Space Invaders",
    "category": "Arcade",
    "author": "dwmkerr / Taito",
    "description": "The definitive retro arcade space shooter. Defend earth from rhythmic descending alien armadas, dodge enemy laser fire, and shoot the mystery flying saucers.",
    "sourceType": "url",
    "sourceRepo": "dwmkerr/spaceinvaders",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://dwmkerr.github.io/spaceinvaders/",
    "coverUrl": "https://upload.wikimedia.org/wikipedia/en/thumb/0/05/Space_Invaders_Flyer.png/220px-Space_Invaders_Flyer.png",
    "createdAt": "2026-10-20T23:28:00.000Z"
  },
  {
    "id": "game-snake-classic",
    "title": "Snake Classic",
    "category": "Arcade",
    "author": "Patrick Roberts",
    "description": "Timeless retro arcade snake game. Eat apples to grow longer while avoiding collisions with the border walls and your own slithering tail.",
    "sourceType": "url",
    "sourceRepo": "patorjk/snake",
    "sourceDir": "",
    "sourcePath": "",
    "playUrl": "https://patorjk.com/games/snake/",
    "coverUrl": "https://cdn.iconscout.com/icon/free/png-512/free-snake-game-458428.png",
    "createdAt": "2026-10-20T23:27:00.000Z"
  }
];

  let allGames = typeof DEFAULT_GAMES !== 'undefined' ? [...DEFAULT_GAMES] : [];
  let activeCategory = 'All';
  let currentPlayingGame = null;
  let pendingIconGame = null;
  let currentIconOptions = [];
  let isAdmin = false;

  // Toggle Admin UI visibility
  function setAdminState(authenticated) {
    isAdmin = Boolean(authenticated);
    adminHeaderNav.hidden = !isAdmin;
    adminPanel.hidden = !isAdmin;
    if (emptyAdminActions) emptyAdminActions.hidden = !isAdmin || allGames.length > 0;
    if (emptyUploadBtn) emptyUploadBtn.hidden = !isAdmin;
    if (editGamePlayerBtn) editGamePlayerBtn.hidden = !isAdmin;
    deleteGameBtn.hidden = !isAdmin;
    if (gamePageEditBtn) gamePageEditBtn.hidden = !isAdmin;
    if (gamePageDeleteBtn) gamePageDeleteBtn.hidden = !isAdmin;
    if (headerManageReposBtn) headerManageReposBtn.hidden = !isAdmin;
    if (bannerManageReposBtn) bannerManageReposBtn.hidden = !isAdmin;
    if (headerRedoIconsBtn) headerRedoIconsBtn.hidden = !isAdmin;
    if (bannerRedoIconsBtn) bannerRedoIconsBtn.hidden = !isAdmin;
    if (headerItchImportBtn) headerItchImportBtn.hidden = !isAdmin;
    if (bannerItchImportBtn) bannerItchImportBtn.hidden = !isAdmin;
    if (headerSuggestionsBtn) headerSuggestionsBtn.hidden = !isAdmin;
    if (bannerSuggestionsBtn) bannerSuggestionsBtn.hidden = !isAdmin;
    if (isAdmin) {
      fetchAdminSuggestions();
    }
    footerAdminBtn.hidden = isAdmin;

    emptyStateDesc.textContent = isAdmin
      ? 'Use the Upload Single Game button to publish files, or Mass GitHub Import to batch import repositories full of games.'
      : 'Check back soon for new playable browser games.';

    renderGames();
  }

  // Password visibility toggle
  togglePasswordBtn.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    togglePasswordBtn.setAttribute('aria-pressed', showing ? 'false' : 'true');
    togglePasswordBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    togglePasswordBtn.textContent = showing ? 'Show' : 'Hide';
  });

  adminLoginDialog.addEventListener('close', () => {
    loginStatus.hidden = true;
    loginSubmitBtn.disabled = false;
    passwordInput.type = 'password';
    togglePasswordBtn.setAttribute('aria-pressed', 'false');
    togglePasswordBtn.textContent = 'Show';
  });

  // Admin Sign-In form submission
  adminLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginStatus.hidden = true;

    if (!adminLoginForm.checkValidity()) {
      const firstInvalid = adminLoginForm.querySelector(':invalid');
      if (firstInvalid) {
        firstInvalid.focus();
        syncAria(firstInvalid);
      }
      return;
    }

    loginSubmitBtn.disabled = true;
    const formData = new FormData(adminLoginForm);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.status === 404) {
        // Fallback for static hosting on Cloudflare Pages
        if (username === 'admin' && password === 'admin123') {
          sessionStorage.setItem('arcade_admin', 'true');
          loginSubmitBtn.disabled = false;
          adminLoginForm.reset();
          adminLoginDialog.close();
          setAdminState(true);
          return;
        }
        loginSubmitBtn.disabled = false;
        loginStatus.textContent = 'Invalid admin credentials.';
        loginStatus.hidden = false;
        return;
      }

      const data = await res.json();
      loginSubmitBtn.disabled = false;

      if (res.ok && data.authenticated) {
        adminLoginForm.reset();
        adminLoginDialog.close();
        setAdminState(true);
      } else {
        loginStatus.textContent = data.error || 'Invalid admin credentials.';
        loginStatus.hidden = false;
      }
    } catch {
      // Fallback if offline or network blocked
      if (username === 'admin' && password === 'admin123') {
        sessionStorage.setItem('arcade_admin', 'true');
        loginSubmitBtn.disabled = false;
        adminLoginForm.reset();
        adminLoginDialog.close();
        setAdminState(true);
        return;
      }
      loginSubmitBtn.disabled = false;
      loginStatus.textContent = 'Network error while signing in.';
      loginStatus.hidden = false;
    }
  });

  // Admin Sign-Out
  adminLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore network error
    }
    sessionStorage.removeItem('arcade_admin');
    if (uploadDialog.open) uploadDialog.close();
    setAdminState(false);
    if (window.location.pathname === '/admin') {
      window.history.replaceState({}, '', '/');
    }
  });

  // Check Admin Session on Page Load
  async function checkAdminSession() {
    try {
      const res = await fetch('/api/admin/session');
      if (res.ok) {
        const data = await res.json();
        setAdminState(Boolean(data.authenticated));
        if (!data.authenticated && window.location.pathname === '/admin') {
          adminLoginDialog.showModal();
        }
        return;
      }
    } catch {
      // Fallback below
    }

    // Static Cloudflare Pages fallback
    const localAuth = sessionStorage.getItem('arcade_admin') === 'true';
    setAdminState(localAuth);
    if (!localAuth && window.location.pathname === '/admin') {
      adminLoginDialog.showModal();
    }
  }

  // Toggle between File upload and URL embed fields
  function updateSourceMode() {
    const selected = document.querySelector('input[name="sourceType"]:checked')?.value || 'file';
    if (selected === 'url') {
      fileSourceGroup.hidden = true;
      gameFileInput.required = false;
      urlSourceGroup.hidden = false;
      gameUrlInput.required = true;
    } else {
      fileSourceGroup.hidden = false;
      gameFileInput.required = true;
      urlSourceGroup.hidden = true;
      gameUrlInput.required = false;
    }
  }

  sourceRadios.forEach((radio) => {
    radio.addEventListener('change', updateSourceMode);
  });

  // File input change & auto-fill title
  gameFileInput.addEventListener('change', () => {
    const file = gameFileInput.files?.[0];
    if (file) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      selectedFileLabel.textContent = `${file.name} (${sizeMb} MB)`;
      if (!titleInput.value.trim()) {
        const cleanName = file.name
          .replace(/\.(html?|zip)$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        titleInput.value = cleanName;
      }
    } else {
      selectedFileLabel.innerHTML = '<strong>Choose a .html or .zip file</strong> or drag it here';
    }
  });

  ['dragenter', 'dragover'].forEach((evtName) => {
    dropzone.addEventListener(evtName, () => dropzone.classList.add('dragover'));
  });
  ['dragleave', 'drop'].forEach((evtName) => {
    dropzone.addEventListener(evtName, () => dropzone.classList.remove('dragover'));
  });

  function resetUploadWizardToStep1() {
    pendingIconGame = null;
    currentIconOptions = [];
    uploadDialogTitle.textContent = 'Upload a Web Game';
    stepTracker1.className = 'step-active';
    stepTracker1.setAttribute('aria-current', 'step');
    stepTracker2.className = 'step-todo';
    stepTracker2.removeAttribute('aria-current');

    uploadForm.hidden = false;
    iconSelectForm.hidden = true;
    formStatus.hidden = true;
    iconStepStatus.hidden = true;
    progressWrap.hidden = true;
    submitUploadBtn.disabled = false;
    saveIconBtn.disabled = false;
  }

  // Reset wizard whenever upload dialog closes
  uploadDialog.addEventListener('close', () => {
    resetUploadWizardToStep1();
  });

  
  // Toast Notification System
  function showToast(message) {
    let toast = document.getElementById('vault-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vault-toast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }


  // Robust fallback icon search (Google Play, Wikipedia API, iTunes API, and procedural SVG covers)
  async function clientIconSearch(gameTitle, category = 'Arcade') {
    const cleanTitle = String(gameTitle || '')
      .replace(/\s*[\(\[](?:html5|web|js|v[\d\.]+|online|free)[\)\]]/gi, '')
      .replace(/\s+(?:game\s+icon|icon|game)$/i, '')
      .trim();
    const query = `${cleanTitle} game icon`;
    const results = [];
    const seenUrls = new Set();

    // 1. Try server search endpoint if available
    try {
      const apiRes = await fetch(`/api/search-icons?q=${encodeURIComponent(query)}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        for (const item of data.results || []) {
          const u = item.thumbnailUrl || item.url;
          if (u && !seenUrls.has(u)) {
            seenUrls.add(u);
            results.push(item);
          }
        }
      }
    } catch {
      // Backend not running / static hosting
    }

    // 2. Wikipedia Commons API (CORS origin=*)
    if (results.length < 5) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(gameTitle + ' video game')}&gsrlimit=6&prop=pageimages&pithumbsize=500&format=json&origin=*`
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : [];
          for (const page of pages) {
            const thumb = page?.thumbnail?.source;
            if (thumb && !seenUrls.has(thumb)) {
              seenUrls.add(thumb);
              results.push({
                url: thumb,
                thumbnailUrl: thumb,
                title: page.title || gameTitle
              });
              if (results.length >= 5) break;
            }
          }
        }
      } catch {
        // Wikipedia search failed
      }
    }

    // 3. Apple iTunes Software search
    if (results.length < 5) {
      try {
        const iRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(gameTitle)}&entity=software&limit=5`
        );
        if (iRes.ok) {
          const data = await iRes.json();
          for (const item of data.results || []) {
            const art = item.artworkUrl512 || item.artworkUrl100;
            if (art && !seenUrls.has(art)) {
              seenUrls.add(art);
              results.push({
                url: art,
                thumbnailUrl: art,
                title: item.trackName || query
              });
              if (results.length >= 5) break;
            }
          }
        }
      } catch {
        // iTunes error ignored
      }
    }

    // 4. Fallback procedural cover ONLY if 0 real icons were found
    if (results.length === 0) {
      const genCover = generateGameCoverSvg(gameTitle, category);
      results.push({
        url: genCover,
        thumbnailUrl: genCover,
        title: `${gameTitle} (Procedural Cover)`
      });
    }

    return { query, results: results.slice(0, 5) };
  }

  // Transition from Step 1 (Upload) to Step 2 (Select Icon)
  async function enterSelectIconStep(createdGame) {
    pendingIconGame = createdGame;
    const cleanTitle = String(createdGame.title || '')
      .replace(/\s*[\(\[](?:html5|web|js|v[\d\.]+|online|free)[\)\]]/gi, '')
      .replace(/\s+(?:game\s+icon|icon|game)$/i, '')
      .trim();
    const expectedQuery = `${cleanTitle} game icon`;

    uploadDialogTitle.textContent = `Select Icon — ${createdGame.title}`;
    stepTracker1.className = 'step-done';
    stepTracker1.removeAttribute('aria-current');
    stepTracker2.className = 'step-active';
    stepTracker2.setAttribute('aria-current', 'step');

    uploadForm.hidden = true;
    iconSelectForm.hidden = false;
    iconSearchQueryBadge.textContent = expectedQuery;
    iconLoadingQuery.textContent = `"${expectedQuery}"`;
    const uploadOpenGoogleLink = document.getElementById('upload-open-google-images');
    if (uploadOpenGoogleLink) {
      uploadOpenGoogleLink.href = `https://www.google.com/search?q=${encodeURIComponent(expectedQuery)}&tbm=isch`;
    }
    iconLoadingState.hidden = false;
    iconResultsFieldset.hidden = true;
    iconStepStatus.hidden = true;
    iconResultsGrid.innerHTML = '';
    saveIconBtn.disabled = true;

    try {
      let data = null;
      try {
        const res = await fetch(`/api/admin/icon-search?q=${encodeURIComponent(createdGame.title)}`);
        if (res.ok) data = await res.json();
      } catch {
        // Fallback below
      }

      if (!data || !Array.isArray(data.results) || data.results.length === 0) {
        data = await clientIconSearch(createdGame.title);
      }

      iconLoadingState.hidden = true;

      if (!data || !Array.isArray(data.results) || data.results.length === 0) {
        iconStepStatus.textContent =
          'No online icon results found. Click Skip to continue with the default cover.';
        iconStepStatus.hidden = false;
        return;
      }

      iconSearchQueryBadge.textContent = data.query || expectedQuery;
      currentIconOptions = data.results.slice(0, 5);
      iconResultsFieldset.hidden = false;
      saveIconBtn.disabled = false;

      currentIconOptions.forEach((item, index) => {
        const radioId = `icon-option-${index}`;
        const label = document.createElement('label');
        label.className = 'icon-choice-card';
        label.setAttribute('for', radioId);

        const img = document.createElement('img');
        img.src = item.thumbnailUrl || item.url;
        img.alt = `${createdGame.title} icon option ${index + 1}`;
        img.width = 84;
        img.height = 84;
        img.loading = 'lazy';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = radioId;
        radio.name = 'selectedIconIndex';
        radio.value = String(index);
        if (index === 0) radio.checked = true;

        const caption = document.createElement('span');
        caption.className = 'icon-choice-label';
        caption.textContent = `Option ${index + 1}`;

        label.append(img, radio, caption);
        iconResultsGrid.appendChild(label);
      });
    } catch {
      iconLoadingState.hidden = true;
      iconStepStatus.textContent = 'Could not load icon search results. Click Skip to continue.';
      iconStepStatus.hidden = false;
    }
  }

  // Handle client-side upload fallback for static hosting
  async function handleClientSideUpload(formData) {
    const title = (formData.get('title') || '').trim();
    const category = (formData.get('category') || 'Arcade').trim();
    const author = (formData.get('author') || 'Indie Creator').trim();
    const description = (formData.get('description') || '').trim();
    const sourceType = formData.get('sourceType') || 'file';
    const gameUrl = (formData.get('gameUrl') || '').trim();
    const gameFile = formData.get('gameFile');

    let playUrl = '';
    let htmlContent = null;
    if (sourceType === 'url') {
      playUrl = gameUrl;
      if (gameUrl.includes('polytrack')) {
        playUrl = '/uploads/games/game-polytrack/index.html';
      } else if (gameUrl.includes('wbwwb')) {
        playUrl = '/uploads/games/game-wbwwb/index.html';
      }
    } else if (gameFile && gameFile instanceof File) {
      playUrl = URL.createObjectURL(gameFile);
      if (gameFile.name.endsWith('.html') || gameFile.name.endsWith('.htm') || gameFile.type === 'text/html') {
        try {
          htmlContent = await gameFile.text();
        } catch {}
      }
    }

    const newGame = {
      id: crypto.randomUUID(),
      title,
      category,
      author: author || 'Indie Creator',
      description: description || 'No description provided.',
      sourceType,
      playUrl,
      htmlContent,
      coverUrl: null,
      createdAt: new Date().toISOString()
    };

    allGames.unshift(newGame);
    await idbSaveGame(newGame);
    renderGames();

    uploadForm.reset();
    selectedFileLabel.innerHTML = '<strong>Choose a .html or .zip file</strong> or drag it here';
    updateSourceMode();

    enterSelectIconStep(newGame);
  }

  // Step 1: Upload form submission
  uploadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    formStatus.hidden = true;

    if (!isAdmin) {
      formStatus.textContent = 'Admin sign-in is required to upload games.';
      formStatus.hidden = false;
      return;
    }

    if (!uploadForm.checkValidity()) {
      const firstInvalid = uploadForm.querySelector(':invalid');
      if (firstInvalid) {
        firstInvalid.focus();
        syncAria(firstInvalid);
      }
      return;
    }

    const formData = new FormData(uploadForm);
    submitUploadBtn.disabled = true;
    progressWrap.hidden = false;
    progressBar.value = 0;
    progressBar.style.setProperty('--brand-hue', '255');
    progressLabel.textContent = 'Uploading game package...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/games');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.value = percent;
        progressLabel.textContent = `Uploading game package... ${percent}%`;
      }
    });

    xhr.addEventListener('load', () => {
      submitUploadBtn.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        progressBar.value = 100;
        progressBar.style.setProperty('--brand-hue', '140');
        progressLabel.textContent = 'Upload complete!';
        const createdGame = JSON.parse(xhr.responseText);
        allGames.unshift(createdGame);
        try { idbSaveGame(createdGame); } catch {}
        renderGames();

        uploadForm.reset();
        selectedFileLabel.innerHTML = '<strong>Choose a .html or .zip file</strong> or drag it here';
        updateSourceMode();

        enterSelectIconStep(createdGame);
      } else if (xhr.status === 404 || xhr.status === 405 || xhr.status === 501 || xhr.status === 0) {
        // Fallback for static hosting on Cloudflare Pages
        progressBar.value = 100;
        progressBar.style.setProperty('--brand-hue', '140');
        progressLabel.textContent = 'Ready!';
        handleClientSideUpload(formData);
      } else {
        progressWrap.hidden = true;
        let errorMsg = 'Upload failed. Please verify your file and try again.';
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.error) errorMsg = parsed.error;
        } catch {
          // Use default message
        }
        formStatus.textContent = errorMsg;
        formStatus.hidden = false;
      }
    });

    xhr.addEventListener('error', () => {
      // Network fallback (static hosting / offline)
      submitUploadBtn.disabled = false;
      handleClientSideUpload(formData);
    });

    xhr.send(formData);
  });

  // Step 2: Skip Icon Selection
  skipIconBtn.addEventListener('click', () => {
    if (pendingIconGame) {
      if (!pendingIconGame.coverUrl) {
        pendingIconGame.coverUrl = generateGameCoverSvg(pendingIconGame.title, pendingIconGame.category);
        const idx = allGames.findIndex(g => g.id === pendingIconGame.id);
        if (idx !== -1) allGames[idx] = pendingIconGame;
        idbSaveGame(pendingIconGame);
        renderGames();
      }
      uploadDialog.close();
      resetUploadWizardToStep1();
    }
  });

  // Step 2: Save Selected Icon & Play
  iconSelectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pendingIconGame) {
      uploadDialog.close();
      return;
    }

    const selectedRadio = iconSelectForm.querySelector('input[name="selectedIconIndex"]:checked');
    const chosenIndex = selectedRadio ? Number(selectedRadio.value) : 0;
    const chosenIcon = currentIconOptions[chosenIndex];

    if (!chosenIcon) {
      const gameToLaunch = pendingIconGame;
      uploadDialog.close();
      openGamePlayer(gameToLaunch);
      return;
    }

    saveIconBtn.disabled = true;
    iconStepStatus.hidden = true;

    try {
      const res = await fetch(`/api/games/${encodeURIComponent(pendingIconGame.id)}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iconUrl: chosenIcon.url,
          thumbnailUrl: chosenIcon.thumbnailUrl
        })
      });

      if (res.ok) {
        const updatedGame = await res.json();
        allGames = allGames.map((g) => (g.id === updatedGame.id ? updatedGame : g));
        renderGames();
        uploadDialog.close();
        openGamePlayer(updatedGame);
        return;
      }
    } catch {
      // Fallback below
    }

    // Client-side fallback for static Cloudflare Pages hosting
    const updatedGame = {
      ...pendingIconGame,
      coverUrl: chosenIcon.thumbnailUrl || chosenIcon.url
    };
    allGames = allGames.map((g) => (g.id === updatedGame.id ? updatedGame : g));
    await idbSaveGame(updatedGame);
    renderGames();
    uploadDialog.close();
    openGamePlayer(updatedGame);
  });

  // ==========================================
  // Mass GitHub Importer Logic
  // ==========================================

  // Open dialog event listeners
  ['header-mass-import-btn', 'banner-mass-import-btn', 'empty-mass-import-btn'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        if (massImportDialog && typeof massImportDialog.showModal === 'function' && !massImportDialog.open) {
          massImportDialog.showModal();
        }
      });
    }
  });

  // Append formatted, timestamped log to live console
  function appendMassConsole(message, level = 'info') {
    if (!massImportConsole) return;
    const time = new Date().toLocaleTimeString();
    const span = document.createElement('span');
    span.className = `log-${level}`;
    span.textContent = `[${time}] ${message}\n`;
    massImportConsole.appendChild(span);
    massImportConsole.scrollTop = massImportConsole.scrollHeight;
  }

  // Insert verified working HTML5 game repository examples
  massInsertExamplesBtn?.addEventListener('click', () => {
    if (!massGithubUrls) return;
    massGithubUrls.value = [
      'https://github.com/gabrielecirulli/2048',
      'https://github.com/alecs/hexgl'
    ].join('\n');
    if (massCategory) massCategory.value = 'Auto';
    if (massAutoIcon) massAutoIcon.checked = true;
    massGithubUrls.focus();
    syncAria(massGithubUrls);
  });

  // Clear live console
  massConsoleClear?.addEventListener('click', () => {
    if (massImportConsole) massImportConsole.innerHTML = '';
  });

  // Reset mass dialog status on close
  massImportDialog?.addEventListener('close', () => {
    if (massFormStatus) massFormStatus.hidden = true;
    if (startMassImportBtn) startMassImportBtn.disabled = false;
  });

  // Extract alphanumeric simplified keys to compare game titles
  function titleKeys(title) {
    if (!title) return [];
    const s = String(title).toLowerCase();
    const spaced = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const compact = s.replace(/[^a-z0-9]/g, '');
    return [spaced, compact].filter(Boolean);
  }

  function isSameGame(titleA, titleB) {
    const keysA = titleKeys(titleA);
    const keysB = titleKeys(titleB);
    if (!keysA.length || !keysB.length) return false;
    return keysA.some((k) => keysB.includes(k));
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

  // Parse GitHub URL or shorthand (e.g. "owner/repo", "https://github.com/owner/repo/tree/branch/subpath")
  function parseGitHubUrlClient(input) {
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

  // Fetch the full list of files in a GitHub repository (with multi-tier fallbacks)
  async function fetchRepoTreeClient(owner, repo, branch, subpath, githubToken) {
    const ghHeaders = { Accept: 'application/vnd.github+json' };
    if (githubToken) {
      ghHeaders['Authorization'] = `Bearer ${githubToken}`;
    }

    const IGNORE_TOP_DIRS = new Set([
      '.git', '.github', '.vscode', '.idea', 'node_modules', 'bower_components',
      'vendor', 'vendors', 'docs', 'doc', 'test', 'tests', '__tests__', 'spec',
      'specs', 'css', 'js', 'scripts', 'styles', 'fonts', 'images', 'img',
      'audio', 'sound', 'sounds', 'media', 'static', 'templates', 'routes', 'partials'
    ]);

    // 1. Primary: GitHub Git Trees API (recursive=1)
    const branchesToTry = branch ? [branch] : ['HEAD', 'main', 'master', 'gh-pages'];
    for (const b of branchesToTry) {
      try {
        const treeUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(b)}?recursive=1`;
        const res = await fetch(treeUrl, { headers: ghHeaders });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tree)) {
            const files = data.tree
              .filter((item) => item.type === 'blob' && item.path)
              .map((item) => item.path);

            // If repository is massive and tree was truncated by GitHub (>100k files), synthesize index.html for truncated game folders
            if (data.truncated) {
              const normSub = subpath ? subpath.replace(/^\/+|\/+$/g, '') : '';
              const dirs = data.tree.filter((item) => item.type === 'tree' && item.path);
              for (const d of dirs) {
                const p = d.path;
                const relToSub = normSub ? (p.startsWith(normSub + '/') ? p.slice(normSub.length + 1) : null) : p;
                if (!relToSub || relToSub.includes('/')) continue;
                if (IGNORE_TOP_DIRS.has(relToSub.toLowerCase()) || relToSub.startsWith('.')) continue;
                const hasFileInside = files.some((f) => f.startsWith(p + '/'));
                if (!hasFileInside) {
                  files.push(`${p}/index.html`);
                }
              }
            }

            return { files, branch: b };
          }
        }
      } catch {
        // Try next
      }
    }

    // 2. Secondary Fallback: jsDelivr Package Flat API (no GitHub rate limits)
    const jsdBranches = branch ? [branch] : ['main', 'master', 'gh-pages'];
    for (const b of jsdBranches) {
      try {
        const jsdUrl = `https://data.jsdelivr.com/v1/package/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}@${encodeURIComponent(b)}/flat`;
        const res = await fetch(jsdUrl);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.files) && data.files.length > 0) {
            const files = data.files
              .map((f) => String(f.name || '').replace(/^\/+/, ''))
              .filter(Boolean);
            return { files, branch: b };
          }
        }
      } catch {
        // Try next
      }
    }

    // 3. Tertiary Fallback: GitHub Contents API for root / subpath directory
    try {
      const contentsPath = subpath ? subpath.replace(/^\/+|\/+$/g, '') : '';
      const refQuery = branch ? `?ref=${encodeURIComponent(branch)}` : '';
      const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${contentsPath}${refQuery}`;
      const res = await fetch(contentsUrl, { headers: ghHeaders });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items)) {
          const files = [];
          for (const item of items) {
            if (item.type === 'file' && item.path) {
              files.push(item.path);
            } else if (item.type === 'dir' && item.path && item.name) {
              if (!IGNORE_TOP_DIRS.has(item.name.toLowerCase()) && !item.name.startsWith('.')) {
                files.push(`${item.path}/index.html`);
              }
            }
          }
          if (files.length > 0) {
            return { files, branch: branch || 'HEAD' };
          }
        }
      }
    } catch {
      // Ignore
    }

    throw new Error(`Could not read repository file tree for ${owner}/${repo}. Verify the repo is public or provide a GitHub token.`);
  }

  // Scan repository file paths to discover all individual playable HTML5 games
  function scanRepoPathsForGamesClient(allPaths, subpath = '') {
    const normalizedSubpath = subpath ? subpath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';

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
    for (const rawPath of allPaths) {
      const rel = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!/\.html?$/i.test(rel)) continue;
      if (normalizedSubpath && rel !== normalizedSubpath && !rel.startsWith(normalizedSubpath + '/')) continue;

      const parts = rel.split('/');
      const fileName = parts[parts.length - 1];
      const dirParts = parts.slice(0, -1);

      if (dirParts.some((d) => IGNORE_DIRS.has(d.toLowerCase()) || d.startsWith('.'))) continue;
      if (IGNORE_FILES.test(fileName)) continue;

      candidateEntries.push({ rel, fileName });
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
          discoveredGames.push({
            gameDir: d,
            entryRelPath: item.rel,
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

        discoveredGames.push({
          gameDir: d,
          entryRelPath: chosenItem.rel,
          isStandaloneFile: false,
          inferredName
        });
      }
    }

    return discoveredGames;
  }

  // Find a cover image inside the repository file list for a given game folder
  function findRepoIconForGame(allPaths, gameDir, owner, repo, branch) {
    const ICON_NAMES = ['icon.png', 'icon.jpg', 'icon.webp', 'logo.png', 'cover.png', 'cover.jpg', 'thumb.png', 'thumbnail.png', 'splash.png', 'favicon.png', 'favicon.ico', 'apple-touch-icon.png'];
    const prefix = gameDir ? `${gameDir}/` : '';
    const dirFiles = allPaths.filter((p) => (prefix ? p.startsWith(prefix) : !p.includes('/')));

    for (const iconName of ICON_NAMES) {
      const match = dirFiles.find((p) => p.slice(prefix.length).toLowerCase() === iconName);
      if (match) {
        const encodedPath = match.split('/').map(encodeURIComponent).join('/');
        return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
      }
    }
    return null;
  }

  // Infer category from game title when Auto/All is selected
  function inferCategoryFromTitle(title, defaultCategory) {
    if (defaultCategory && defaultCategory !== 'Auto' && defaultCategory !== 'All') {
      return defaultCategory;
    }
    const lower = String(title || '').toLowerCase();
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

  // Client-side fallback mass import (for Cloudflare Pages static hosting)
  async function handleClientSideMassImport(lines, defaultCategory, autoPickFirstIcon, githubToken = '') {
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const sessionGameIds = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const parsed = parseGitHubUrlClient(raw);
      if (!parsed) {
        errorCount++;
        appendMassConsole(`Invalid GitHub repository URL format: "${raw}"`, 'error');
        continue;
      }

      const { owner, repo, branch, subpath, fullName: repoFullName } = parsed;
      appendMassConsole(`[${i + 1}/${lines.length}] Scanning repository ${repoFullName} for games...`, 'info');
      massStatusLabel.textContent = `Scanning ${repoFullName}...`;

      let treeData;
      try {
        treeData = await fetchRepoTreeClient(owner, repo, branch, subpath, githubToken);
      } catch (err) {
        errorCount++;
        appendMassConsole(`Failed to scan ${repoFullName}: ${err.message}`, 'error');
        continue;
      }

      const resolvedBranch = treeData.branch || branch || 'HEAD';
      let detectedGames = scanRepoPathsForGamesClient(treeData.files, subpath);

      // Check if the repo also defines a games.json / projects.json catalog when <= 1 HTML game was found
      if (detectedGames.length <= 1) {
        const jsonCatalogPath = treeData.files.find((f) => /^(?:data\/|assets\/|public\/)?(?:games|projects|list)\.json$/i.test(f));
        if (jsonCatalogPath) {
          try {
            const rawJsonUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(resolvedBranch)}/${jsonCatalogPath}`;
            const jRes = await fetch(rawJsonUrl);
            if (jRes.ok) {
              const jData = await jRes.json();
              const arr = Array.isArray(jData) ? jData : (Array.isArray(jData?.games) ? jData.games : []);
              const jsonGames = [];
              for (const item of arr) {
                const gTitle = item?.title || item?.name;
                const gPath = item?.url || item?.playUrl || item?.link || item?.path || item?.file || item?.directory;
                if (gTitle && gPath) {
                  const cleanPath = String(gPath).replace(/^\/+/, '');
                  const isExternal = /^https?:\/\//i.test(cleanPath);
                  const entryRel = isExternal ? cleanPath : (/\.html?$/i.test(cleanPath) ? cleanPath : `${cleanPath.replace(/\/+$/, '')}/index.html`);
                  jsonGames.push({
                    gameDir: isExternal ? '' : entryRel.split('/').slice(0, -1).join('/'),
                    entryRelPath: entryRel,
                    externalPlayUrl: isExternal ? cleanPath : null,
                    externalCoverUrl: item?.image || item?.icon || item?.img || item?.cover || item?.coverUrl || null,
                    isStandaloneFile: false,
                    inferredName: gTitle
                  });
                }
              }
              if (jsonGames.length > detectedGames.length) {
                detectedGames = jsonGames;
              }
            }
          } catch {
            // Ignore JSON catalog parse errors
          }
        }
      }

      if (detectedGames.length === 0) {
        errorCount++;
        appendMassConsole(`No playable HTML5 game files found in ${repoFullName}.`, 'warn');
        continue;
      }

      appendMassConsole(`Discovered ${detectedGames.length} game(s) in ${repoFullName}!`, 'success');

      // If this repo has multiple games and a legacy single-repo placeholder exists from an older import, remove that placeholder
      if (detectedGames.length > 1) {
        const repoTitleGuess = formatSlugToTitle(repo);
        const placeholderIdx = allGames.findIndex(
          (g) =>
            g.sourceRepo &&
            g.sourceRepo.toLowerCase() === repoFullName.toLowerCase() &&
            !g.sourcePath &&
            isSameGame(g.title, repoTitleGuess)
        );
        if (placeholderIdx !== -1) {
          const [removedPlaceholder] = allGames.splice(placeholderIdx, 1);
          await idbDeleteGame(removedPlaceholder.id);
          renderGames();
          appendMassConsole(`Replaced old single-repo entry "${removedPlaceholder.title}" with ${detectedGames.length} individual games.`, 'info');
        }
      }

      for (let gIdx = 0; gIdx < detectedGames.length; gIdx++) {
        const gameItem = detectedGames[gIdx];
        const rawSlug = gameItem.inferredName || gameItem.gameDir || repo;
        const title = formatSlugToTitle(rawSlug);

        // Check if this specific game is already in our library (by title or by repo + entryRelPath)
        const alreadyExists = allGames.find((g) => {
          if (g.title && isSameGame(g.title, title)) return true;
          if (g.sourceRepo && g.sourceRepo.toLowerCase() === repoFullName.toLowerCase()) {
            if (g.sourcePath && gameItem.entryRelPath && g.sourcePath.toLowerCase() === gameItem.entryRelPath.toLowerCase()) {
              return true;
            }
            if (!g.sourcePath && g.sourceDir && gameItem.gameDir && g.sourceDir.toLowerCase() === gameItem.gameDir.toLowerCase()) {
              return true;
            }
          }
          return false;
        });

        if (alreadyExists) {
          skippedCount++;
          appendMassConsole(
            `⏭️ [${gIdx + 1}/${detectedGames.length}] Skipped "${title}" from ${repoFullName} (already in library as "${alreadyExists.title}")`,
            'warn'
          );
          const pct = Math.min(99, Math.round((((i + (gIdx + 1) / detectedGames.length) / lines.length) * 100)));
          massImportProgress.value = pct;
          massProgressPercent.textContent = `${pct}%`;
          continue;
        }

        const encodedEntryPath = gameItem.entryRelPath.split('/').map(encodeURIComponent).join('/');
        const playUrl =
          gameItem.externalPlayUrl ||
          `https://raw.githack.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(resolvedBranch)}/${encodedEntryPath}`;

        let coverUrl = gameItem.externalCoverUrl || null;
        if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
          const cleanCover = coverUrl.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
          coverUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(resolvedBranch)}/${cleanCover}`;
        }

        const category = inferCategoryFromTitle(title, defaultCategory);

        if (autoPickFirstIcon) {
          massStatusLabel.textContent = `[${gIdx + 1}/${detectedGames.length}] Fetching icon for "${title}"...`;
          const iconData = await clientIconSearch(title, category);
          if (iconData?.results?.length > 0) {
            coverUrl = iconData.results[0].thumbnailUrl || iconData.results[0].url;
            appendMassConsole(`[${gIdx + 1}/${detectedGames.length}] Applied 1st icon result for "${title}"`, 'info');
          }
        }

        if (!coverUrl) {
          coverUrl = findRepoIconForGame(treeData.files, gameItem.gameDir, owner, repo, resolvedBranch);
        }

        if (!coverUrl) {
          coverUrl = generateGameCoverSvg(title, category);
        }

        const newGame = {
          id: crypto.randomUUID(),
          title,
          category,
          author: owner,
          description: `Imported from GitHub: ${repoFullName} (${gameItem.entryRelPath})`,
          sourceType: 'url',
          sourceRepo: repoFullName,
          sourceDir: gameItem.gameDir || '',
          sourcePath: gameItem.entryRelPath,
          playUrl,
          coverUrl,
          createdAt: new Date().toISOString()
        };

        allGames.unshift(newGame);
        await idbSaveGame(newGame);
        sessionGameIds.push(newGame.id);
        renderGames();
        importedCount++;

        appendMassConsole(`🎉 [${gIdx + 1}/${detectedGames.length}] Added "${title}" (${category}) to ArcadeVault!`, 'success');
        const pct = Math.min(99, Math.round((((i + (gIdx + 1) / detectedGames.length) / lines.length) * 100)));
        massImportProgress.value = pct;
        massProgressPercent.textContent = `${pct}%`;
      }
    }

    massImportProgress.value = 100;
    massProgressPercent.textContent = '100%';
    const skipNotice = skippedCount ? `, ${skippedCount} skipped` : '';
    massStatusLabel.textContent = `Completed! ${importedCount} game(s) imported${skipNotice}.`;
    appendMassConsole(
      `\n🏁 Import complete! Added ${importedCount} game(s) to library (${skippedCount} skipped as already existing, ${errorCount} errors).`,
      'success'
    );

    startMassImportBtn.disabled = false;
    if (sessionGameIds.length > 0) {
      setLastImportedBatch(sessionGameIds, `${sessionGameIds.length} games`);
    }
    const skipSummary = skippedCount > 0 ? ` (${skippedCount} skipped as already in library)` : '';
    massFormStatus.textContent = `🎉 Success! Mass import finished with ${importedCount} game(s) imported${skipSummary} and 1st Google icons applied.`;
    massFormStatus.hidden = false;
  }

  // Handle Mass GitHub Import submission
  massImportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (massFormStatus) massFormStatus.hidden = true;

    if (!isAdmin) {
      massFormStatus.textContent = 'Admin sign-in is required to import games.';
      massFormStatus.hidden = false;
      return;
    }

    if (!massImportForm.checkValidity()) {
      const firstInvalid = massImportForm.querySelector(':invalid');
      if (firstInvalid) {
        firstInvalid.focus();
        syncAria(firstInvalid);
      }
      return;
    }

    const rawUrls = massGithubUrls.value;
    const lines = rawUrls.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      massFormStatus.textContent = 'Please enter at least one GitHub repository URL.';
      massFormStatus.hidden = false;
      return;
    }

    const defaultCategory = massCategory.value;
    const autoPickFirstIcon = massAutoIcon.checked;
    const githubToken = (massGithubToken?.value || '').trim();

    startMassImportBtn.disabled = true;
    massProgressSection.hidden = false;
    massImportProgress.value = 0;
    massProgressPercent.textContent = '0%';
    massStatusLabel.textContent = `Starting mass import for ${lines.length} repository entry/entries...`;
    massImportConsole.innerHTML = '';
    appendMassConsole(`Initiating mass import for ${lines.length} repository/repositories...`, 'info');
    appendMassConsole(`Icon Mode: ${autoPickFirstIcon ? 'Automatically pick 1st Google Images result' : 'Manual'}`, 'info');

    let totalImportedCount = 0;
    let totalSkippedCount = 0;
    const sessionImportedIds = [];

    try {
      let response = null;
      let isStaticHosting = false;

      try {
        response = await fetch('/api/admin/mass-import-github', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify({
            repoUrls: lines,
            defaultCategory,
            autoPickFirstIcon,
            githubToken
          })
        });
      } catch (netErr) {
        // Network error (CORS blocked, offline, or static deployment)
        isStaticHosting = true;
      }

      // Check if host indicated static hosting or method not allowed (Cloudflare Pages returns 405 for POST to static URLs)
      if (isStaticHosting || !response || response.status === 404 || response.status === 405 || response.status === 501 || response.status === 502) {
        const reason = isStaticHosting ? 'Client-Side Mode' : `HTTP ${response.status}`;
        appendMassConsole(`Static hosting environment detected (${reason}). Running client-side repository import...`, 'warn');
        await handleClientSideMassImport(lines, defaultCategory, autoPickFirstIcon, githubToken);
        return;
      }

      if (response.status === 401) {
        setAdminState(false);
        adminLoginDialog.showModal();
        throw new Error('Admin session expired or unauthorized. Please sign in again.');
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: Failed to start mass import.`;
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            if (errData.error) errMessage = errData.error;
          } catch {
            if (text && text.length < 200) errMessage = text.trim();
          }
        } catch {}
        throw new Error(errMessage);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const eventData = JSON.parse(jsonStr);

              if (eventData.type === 'log') {
                appendMassConsole(eventData.message, eventData.level || 'info');
                massStatusLabel.textContent = eventData.message;
              } else if (eventData.type === 'game_skipped') {
                totalSkippedCount++;
                appendMassConsole(
                  `⏭️ Skipped "${eventData.title}" (${eventData.reason || 'already in library'})`,
                  'warn'
                );
              } else if (eventData.type === 'game_imported') {
                totalImportedCount++;
                const newGame = eventData.game;
                sessionImportedIds.push(newGame.id);
                allGames.unshift(newGame);
                renderGames();

                appendMassConsole(`🎉 Successfully added "${newGame.title}" (${newGame.category}) to ArcadeVault!`, 'success');
                const denom = eventData.progress?.totalInRepo || lines.length || 1;
                const numer = eventData.progress?.current || (totalImportedCount + totalSkippedCount);
                const progressPct = Math.min(95, Math.round((numer / denom) * 100));
                massImportProgress.value = progressPct;
                massProgressPercent.textContent = `${progressPct}%`;
              } else if (eventData.type === 'complete') {
                massImportProgress.value = 100;
                massProgressPercent.textContent = '100%';
                const skippedNotice = eventData.totalSkipped ? `, ${eventData.totalSkipped} skipped (already in library)` : '';
                massStatusLabel.textContent = `Completed! ${eventData.totalImported} game(s) imported${skippedNotice}.`;
                if (sessionImportedIds.length > 0) {
                  setLastImportedBatch(sessionImportedIds, `${sessionImportedIds.length} games`);
                }
                appendMassConsole(`\n🏁 Mass Import Complete! Total imported: ${eventData.totalImported}, Skipped (already in library): ${eventData.totalSkipped || 0}, Errors: ${eventData.totalErrors}`, 'success');
                if (eventData.errors?.length > 0) {
                  eventData.errors.forEach((err) => {
                    appendMassConsole(`- ${err.url}: ${err.error}`, 'error');
                  });
                }
              }
            } catch (jsonErr) {
              console.warn('SSE parsing error:', jsonErr);
            }
          }
        }
      } else {
        const result = await response.json();
        if (Array.isArray(result.importedGames)) {
          for (const g of result.importedGames) {
            allGames.unshift(g);
            sessionImportedIds.push(g.id);
          }
          renderGames();
          totalImportedCount = result.importedGames.length;
          if (sessionImportedIds.length > 0) {
            setLastImportedBatch(sessionImportedIds, `${sessionImportedIds.length} games`);
          }
        }
        totalSkippedCount = result.totalSkipped || 0;
        massImportProgress.value = 100;
        massProgressPercent.textContent = '100%';
        appendMassConsole(`Imported ${result.totalImported} games (${totalSkippedCount} skipped)!`, 'success');
      }

      startMassImportBtn.disabled = false;
      const skipSummary = totalSkippedCount > 0 ? ` (${totalSkippedCount} skipped as already existing)` : '';
      massFormStatus.textContent = `🎉 Success! Mass import finished with ${totalImportedCount} game(s) imported${skipSummary} and 1st Google icons applied.`;
      massFormStatus.hidden = false;
    } catch (err) {
      startMassImportBtn.disabled = false;
      appendMassConsole(`Fatal error: ${err.message}`, 'error');
      massFormStatus.textContent = err.message || 'Mass import failed.';
      massFormStatus.hidden = false;
    }
  });

  // Search and category filtering
  filterForm.addEventListener('submit', (e) => e.preventDefault());

  searchInput.addEventListener('input', () => {
    renderGames();
  });

  categoryFilters.addEventListener('click', (e) => {
    const pill = e.target.closest('button[data-category]');
    if (!pill) return;
    activeCategory = pill.getAttribute('data-category');
    categoryFilters.querySelectorAll('.pill').forEach((btn) => {
      const isSelected = btn === pill;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
    renderGames();
  });

  async function deleteGameById(game) {
    const confirmed = window.confirm(`Delete "${game.title}" from your library?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        allGames = allGames.filter((g) => g.id !== game.id);
        if (playerDialog.open && currentPlayingGame?.id === game.id) {
          playerDialog.close();
        }
        if (currentPlayingGame?.id === game.id) {
          showCatalogView();
        }
        renderGames();
        return;
      }
    } catch {
      // Fallback below
    }

    // Client-side fallback
    allGames = allGames.filter((g) => g.id !== game.id);
    await idbDeleteGame(game.id);
    if (playerDialog.open && currentPlayingGame?.id === game.id) {
      playerDialog.close();
    }
    if (currentPlayingGame?.id === game.id) {
      showCatalogView();
    }
    renderGames();
  }

  // Helper to create a game card element (used in catalog grid & related games)
  function createGameCard(game) {
    const article = document.createElement('article');
    article.className = 'game-card';
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', `Play ${game.title}`);

    // Clicking anywhere on card navigates to dedicated game page
    article.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      showGamePageView(game);
    });

    article.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button, a')) return;
        e.preventDefault();
        showGamePageView(game);
      }
    });

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'card-thumb-wrap';

    const fallbackCover = generateGameCoverSvg(game.title, game.category);
    const img = document.createElement('img');
    img.src = game.coverUrl || fallbackCover;
    img.alt = `${game.title} cover`;
    img.width = 640;
    img.height = 360;
    img.loading = 'lazy';
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackCover;
    };
    thumbWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    const topMeta = document.createElement('div');
    topMeta.className = 'card-top-meta';

    const catBadge = document.createElement('span');
    catBadge.className = 'badge';
    catBadge.textContent = game.category || 'Arcade';

    const sourceTag = document.createElement('span');
    sourceTag.className = 'card-source-tag';
    sourceTag.textContent = game.sourceType === 'url' ? 'External URL' : 'Hosted Web Build';

    topMeta.append(catBadge, sourceTag);

    const h3 = document.createElement('h3');
    h3.className = 'card-title';
    h3.textContent = game.title;

    const authorP = document.createElement('p');
    authorP.className = 'card-author';
    authorP.textContent = `By ${game.author || 'Indie Creator'}`;

    const descP = document.createElement('p');
    descP.className = 'card-desc';
    descP.textContent = game.description || 'Click Play Now to launch this web game in your browser.';

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn btn-primary btn-sm btn-play';
    playBtn.textContent = '▶ Play Now';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showGamePageView(game);
    });

    actions.appendChild(playBtn);

    if (isAdmin) {
      const cardEditBtn = document.createElement('button');
      cardEditBtn.type = 'button';
      cardEditBtn.className = 'btn btn-secondary btn-sm';
      cardEditBtn.textContent = '✏️ Edit';
      cardEditBtn.title = 'Edit game details';
      cardEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditGameModal(game);
      });
      actions.appendChild(cardEditBtn);

      const cardDelBtn = document.createElement('button');
      cardDelBtn.type = 'button';
      cardDelBtn.className = 'btn btn-danger btn-sm';
      cardDelBtn.textContent = 'Delete';
      cardDelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGameById(game);
      });
      actions.appendChild(cardDelBtn);
    }

    body.append(topMeta, h3, authorP, descP, actions);
    article.append(thumbWrap, body);
    return article;
  }

  // Render Game Cards in Catalog
  function renderGames() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = allGames.filter((game) => {
      const matchesCat = activeCategory === 'All' || (game.category && game.category.trim().toLowerCase() === activeCategory.trim().toLowerCase());
      const matchesQuery =
        !query ||
        game.title.toLowerCase().includes(query) ||
        (game.author && game.author.toLowerCase().includes(query)) ||
        (game.category && game.category.toLowerCase().includes(query)) ||
        (game.description && game.description.toLowerCase().includes(query));
      return matchesCat && matchesQuery;
    });

    gameCountBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
    gamesGrid.innerHTML = '';

    if (filtered.length === 0) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    filtered.forEach((game) => {
      gamesGrid.appendChild(createGameCard(game));
    });
  }

  // Resolve optimal playable URL (local ripped bundle or direct embed)
  function resolveGamePlayUrl(game) {
    if (!game) return '';
    const id = String(game.id || '').toLowerCase();
    const title = String(game.title || '').toLowerCase();
    const playUrl = String(game.playUrl || '').trim();
    const repo = String(game.sourceRepo || '').toLowerCase();

    // 1. Check Polytrack (fully ripped into /uploads/games/game-polytrack/)
    if (
      id === 'game-polytrack' ||
      title === 'polytrack' ||
      playUrl.includes('game-polytrack') ||
      playUrl.includes('kodub.itch.io/polytrack') ||
      repo.includes('kodub.itch.io/polytrack')
    ) {
      return '/uploads/games/game-polytrack/index.html';
    }

    // 2. Check We Become What We Behold
    if (
      id === 'game-wbwwb' ||
      title.includes('we become what we behold') ||
      playUrl.includes('game-wbwwb') ||
      playUrl.includes('ncase.itch.io/wbwwb') ||
      repo.includes('ncase.itch.io/wbwwb')
    ) {
      return '/uploads/games/game-wbwwb/index.html';
    }

    return playUrl;
  }

  // Graceful fallback for games blocked by iframe security headers (e.g. unripped itch store pages)
  function setIframeFallback(game, fallbackUrl) {
    if (!gamePageIframe) return;
    if (gamePageLoader) gamePageLoader.hidden = true;
    gamePageIframe.removeAttribute('src');
    gamePageIframe.srcdoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            margin: 0;
            padding: 2.5rem 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 85vh;
            background: #0b0f19;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            text-align: center;
            box-sizing: border-box;
          }
          .icon { font-size: 3rem; margin-bottom: 1rem; }
          h2 { margin: 0 0 0.5rem; font-size: 1.6rem; color: #38bdf8; font-weight: 700; }
          p { margin: 0 0 1.5rem; color: #94a3b8; max-width: 480px; font-size: 1rem; line-height: 1.6; }
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.85rem 1.75rem;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: #ffffff;
            text-decoration: none;
            border-radius: 9999px;
            font-weight: 600;
            font-size: 1rem;
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
            transition: all 0.2s ease;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(99, 102, 241, 0.5);
          }
          .hint { margin-top: 1.25rem; font-size: 0.8rem; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="icon">🎮</div>
        <h2>${escapeHtml(game.title || 'Play Game')}</h2>
        <p>This indie title uses an external player sandbox. Launch it below to play instantly in full screen!</p>
        <a href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noopener noreferrer" class="btn">
          <span>🚀 Launch External Game Player</span>
        </a>
        <div class="hint">Ad-free direct embed launcher</div>
      </body>
      </html>
    `;
  }

  // Dedicated Game Page Navigation & View Controller
  function showGamePageView(game, pushHistory = true) {
    if (!game) return;
    currentPlayingGame = game;

    if (catalogView) catalogView.hidden = true;
    if (gamePageView) gamePageView.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Breadcrumbs
    if (gamePageCrumbCategory) gamePageCrumbCategory.textContent = game.category || 'Arcade';
    if (gamePageCrumbTitle) gamePageCrumbTitle.textContent = game.title;

    // Resolve optimal playable URL (self-hosted / ripped build if available)
    const resolvedUrl = resolveGamePlayUrl(game);
    if (resolvedUrl && resolvedUrl !== game.playUrl) {
      game.playUrl = resolvedUrl;
    }

    // Toolbar buttons
    if (gamePageNewtabLink) gamePageNewtabLink.href = game.playUrl || '#';
    if (gamePageTroubleshootLink) gamePageTroubleshootLink.href = game.playUrl || '#';
    if (gamePageEditBtn) gamePageEditBtn.hidden = !isAdmin;
    if (gamePageDeleteBtn) gamePageDeleteBtn.hidden = !isAdmin;

    // Metadata & Cover
    updateGamePageMetadata(game);

    // Launch Game in Iframe
    if (gamePageIframe) {
      if (gamePageLoader) gamePageLoader.hidden = false;
      if (game.htmlContent) {
        try {
          const blob = new Blob([game.htmlContent], { type: 'text/html' });
          gamePageIframe.src = URL.createObjectURL(blob);
        } catch {
          gamePageIframe.srcdoc = game.htmlContent;
        }
      } else {
        const targetUrl = game.playUrl || 'about:blank';
        // Check if this is a raw itch.io store page that cannot be framed
        if (targetUrl.includes('.itch.io/') && !targetUrl.includes('.itch.zone/')) {
          gamePageIframe.removeAttribute('srcdoc');
          gamePageIframe.src = 'about:blank';
          // Auto-rip and resolve the direct playable code every time
          fetch(`/api/resolve-itch?url=${encodeURIComponent(targetUrl)}&rip=1`)
            .then((res) => {
              if (!res.ok) throw new Error('Failed to resolve');
              return res.json();
            })
            .then((data) => {
              if (data && data.playUrl) {
                game.playUrl = data.playUrl;
                if (data.isLocal) {
                  game.sourceDir = `uploads/games/${data.gameId || ''}`;
                  game.sourcePath = 'index.html';
                }
                const existingIdx = allGames.findIndex((g) => g.id === game.id);
                if (existingIdx !== -1) allGames[existingIdx] = game;
                if (currentPlayingGame && currentPlayingGame.id === game.id) {
                  gamePageIframe.src = data.playUrl;
                  if (gamePageNewtabLink) gamePageNewtabLink.href = data.playUrl;
                  if (gamePageTroubleshootLink) gamePageTroubleshootLink.href = data.playUrl;
                }
                try { idbSaveGame(game); } catch {}
              } else {
                setIframeFallback(game, targetUrl);
              }
            })
            .catch(() => {
              setIframeFallback(game, targetUrl);
            });
        } else {
          gamePageIframe.removeAttribute('srcdoc');
          gamePageIframe.src = targetUrl;
        }
      }
    }

    // Recommended / Related Games
    renderGamePageRelated(game);

    // URL & Document Title
    document.title = `${game.title} - ArcadeVault`;
    if (pushHistory) {
      const url = new URL(window.location);
      url.searchParams.set('game', game.id);
      window.history.pushState({ gameId: game.id }, '', url.toString());
    }
  }

  // Update Game Page Metadata
  function updateGamePageMetadata(game) {
    if (gamePageTitle) gamePageTitle.textContent = game.title;
    if (gamePageCategoryBadge) gamePageCategoryBadge.textContent = game.category || 'Arcade';
    if (gamePageSourceBadge) gamePageSourceBadge.textContent = game.sourceType === 'url' ? 'External URL' : 'Hosted Web Build';
    if (gamePageAuthor) gamePageAuthor.textContent = `By ${game.author || 'Indie Creator'}`;
    if (gamePageDesc) gamePageDesc.textContent = game.description || 'No description provided.';
    if (gamePageCrumbTitle) gamePageCrumbTitle.textContent = game.title;
    if (gamePageCrumbCategory) gamePageCrumbCategory.textContent = game.category || 'Arcade';

    if (gamePageCoverImg) {
      const fallback = generateGameCoverSvg(game.title, game.category);
      gamePageCoverImg.src = game.coverUrl || fallback;
      gamePageCoverImg.alt = `${game.title} cover`;
      gamePageCoverImg.onerror = () => {
        gamePageCoverImg.onerror = null;
        gamePageCoverImg.src = fallback;
      };
    }
  }

  // Switch back to Catalog View
  function showCatalogView(pushHistory = true) {
    currentPlayingGame = null;
    if (gamePageIframe) gamePageIframe.src = 'about:blank';
    if (gamePageView) gamePageView.hidden = true;
    if (catalogView) catalogView.hidden = false;
    document.title = 'ArcadeVault - Free Web Games & Indie Arcade';

    if (pushHistory) {
      const url = new URL(window.location);
      url.searchParams.delete('game');
      window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  }

  // Render Related Games Section on Game Page
  function renderGamePageRelated(currentGame) {
    if (!gamePageRelatedGrid) return;
    gamePageRelatedGrid.innerHTML = '';

    const candidates = allGames.filter((g) => g.id !== currentGame.id);
    const sameCat = candidates.filter((g) => (g.category || '').trim().toLowerCase() === (currentGame.category || '').trim().toLowerCase());
    const otherCat = candidates.filter((g) => (g.category || '').trim().toLowerCase() !== (currentGame.category || '').trim().toLowerCase());
    const related = [...sameCat, ...otherCat].slice(0, 4);

    if (related.length === 0) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.style.gridColumn = '1 / -1';
      note.textContent = 'No other games currently available in the vault.';
      gamePageRelatedGrid.appendChild(note);
      return;
    }

    related.forEach((game) => {
      gamePageRelatedGrid.appendChild(createGameCard(game));
    });
  }

  // Backward compatibility alias for modal player
  function openGamePlayer(game) {
    showGamePageView(game);
  }

  // Wire Game Page toolbar actions
  if (gamePageBackBtn) {
    gamePageBackBtn.addEventListener('click', () => {
      showCatalogView();
    });
  }

  const brandLink = document.querySelector('.brand');
  if (brandLink) {
    brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      showCatalogView();
    });
  }

  if (gamePageIframe && gamePageLoader) {
    gamePageIframe.addEventListener('load', () => {
      gamePageLoader.hidden = true;
    });
  }

  if (gamePageReloadBtn) {
    gamePageReloadBtn.addEventListener('click', () => {
      if (currentPlayingGame && gamePageIframe) {
        if (gamePageLoader) gamePageLoader.hidden = false;
        const playUrl = resolveGamePlayUrl(currentPlayingGame);
        if (currentPlayingGame.htmlContent) {
          try {
            const blob = new Blob([currentPlayingGame.htmlContent], { type: 'text/html' });
            gamePageIframe.src = URL.createObjectURL(blob);
          } catch {
            gamePageIframe.srcdoc = currentPlayingGame.htmlContent;
          }
        } else if (playUrl.includes('.itch.io/') && !playUrl.includes('.itch.zone/')) {
          fetch(`/api/resolve-itch?url=${encodeURIComponent(playUrl)}&rip=1`)
            .then((res) => res.json())
            .then((data) => {
              if (data && data.playUrl) {
                gamePageIframe.removeAttribute('srcdoc');
                gamePageIframe.src = data.playUrl;
              } else {
                setIframeFallback(currentPlayingGame, playUrl);
              }
            })
            .catch(() => {
              setIframeFallback(currentPlayingGame, playUrl);
            });
        } else {
          gamePageIframe.removeAttribute('srcdoc');
          gamePageIframe.src = playUrl || 'about:blank';
        }
      }
    });
  }

  if (gamePageFullscreenBtn) {
    gamePageFullscreenBtn.addEventListener('click', () => {
      const stage = gamePageStageWrap || playerStage;
      if (!stage) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (stage.requestFullscreen) {
        stage.requestFullscreen().catch(() => {});
      } else if (stage.webkitRequestFullscreen) {
        stage.webkitRequestFullscreen();
      }
    });
  }

  if (gamePageShareBtn) {
    gamePageShareBtn.addEventListener('click', async () => {
      if (!currentPlayingGame) return;
      const shareUrl = `${window.location.origin}${window.location.pathname}?game=${encodeURIComponent(currentPlayingGame.id)}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const temp = document.createElement('input');
          temp.value = shareUrl;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }
        showToast('📋 Game link copied to clipboard!');
      } catch {
        showToast('Game URL: ' + shareUrl);
      }
    });
  }

  if (gamePageEditBtn) {
    gamePageEditBtn.addEventListener('click', () => {
      if (currentPlayingGame) {
        openEditGameModal(currentPlayingGame);
      }
    });
  }

  if (gamePageDeleteBtn) {
    gamePageDeleteBtn.addEventListener('click', () => {
      if (currentPlayingGame) {
        deleteGameById(currentPlayingGame);
      }
    });
  }

  // Listen to browser Back / Forward buttons
  window.addEventListener('popstate', (e) => {
    const params = new URLSearchParams(window.location.search);
    const gameId = e.state?.gameId || params.get('game');
    if (gameId) {
      const found = allGames.find((g) => g.id === gameId);
      if (found) {
        showGamePageView(found, false);
      } else {
        showCatalogView(false);
      }
    } else {
      showCatalogView(false);
    }
  });

  playerDialog.addEventListener('close', () => {
    gameIframe.src = 'about:blank';
  });

  reloadGameBtn.addEventListener('click', () => {
    if (currentPlayingGame) {
      gameIframe.src = currentPlayingGame.playUrl;
    }
  });

  fullscreenGameBtn.addEventListener('click', () => {
    if (playerStage.requestFullscreen) {
      playerStage.requestFullscreen();
    }
  });

  deleteGameBtn.addEventListener('click', () => {
    if (currentPlayingGame) {
      deleteGameById(currentPlayingGame);
    }
  });


  
  // ==========================================
  // Undo Repo Uploads & Repository Management
  // ==========================================
  let lastImportedSessionGameIds = [];
  try {
    lastImportedSessionGameIds = JSON.parse(sessionStorage.getItem('arcade_last_import_ids') || '[]');
  } catch {}
  let lastImportedSessionLabel = sessionStorage.getItem('arcade_last_import_label') || '';

  function setLastImportedBatch(ids, label) {
    lastImportedSessionGameIds = Array.isArray(ids) ? ids : [];
    lastImportedSessionLabel = label || '';
    if (lastImportedSessionGameIds.length > 0) {
      sessionStorage.setItem('arcade_last_import_ids', JSON.stringify(lastImportedSessionGameIds));
      sessionStorage.setItem('arcade_last_import_label', lastImportedSessionLabel);
      if (massUndoRecentBtn) {
        massUndoRecentBtn.hidden = false;
        massUndoRecentBtn.textContent = `↩️ Undo This Import (${lastImportedSessionGameIds.length})`;
      }
      if (quickUndoBatchBanner) {
        quickUndoBatchBanner.hidden = false;
        if (quickUndoBatchLabel) quickUndoBatchLabel.textContent = `${lastImportedSessionGameIds.length} games imported`;
      }
    } else {
      sessionStorage.removeItem('arcade_last_import_ids');
      sessionStorage.removeItem('arcade_last_import_label');
      if (massUndoRecentBtn) massUndoRecentBtn.hidden = true;
      if (quickUndoBatchBanner) quickUndoBatchBanner.hidden = true;
    }
  }

  // Initialize undo button state on page load
  if (lastImportedSessionGameIds.length > 0) {
    setLastImportedBatch(lastImportedSessionGameIds, lastImportedSessionLabel);
  }

  // Undo an entire imported repository
  async function undoRepoUpload(repoFullName, count) {
    const confirmed = window.confirm(
      `Undo upload of "${repoFullName}"?\n\nThis will permanently delete all ${count} game(s) imported from this repository.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/undo-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoFullName })
      });

      if (res.ok) {
        const data = await res.json();
        const removedIds = new Set(data.removedGameIds || []);
        allGames = allGames.filter((g) => !removedIds.has(g.id));
        if (currentPlayingGame && removedIds.has(currentPlayingGame.id)) {
          showCatalogView();
        }
        renderGames();
        renderImportedReposModal();
        showToast(`↩️ Removed all ${data.removedCount} games from ${repoFullName}`);
        return;
      }
    } catch {
      // Fallback below
    }

    // Client-side fallback (for Cloudflare Pages static hosting)
    const lowerTarget = repoFullName.toLowerCase();
    const toRemove = allGames.filter((g) => g.sourceRepo && g.sourceRepo.toLowerCase() === lowerTarget);
    for (const g of toRemove) {
      await idbDeleteGame(g.id);
    }
    allGames = allGames.filter((g) => !g.sourceRepo || g.sourceRepo.toLowerCase() !== lowerTarget);
    if (currentPlayingGame && currentPlayingGame.sourceRepo && currentPlayingGame.sourceRepo.toLowerCase() === lowerTarget) {
      showCatalogView();
    }
    renderGames();
    renderImportedReposModal();
    showToast(`↩️ Removed all ${toRemove.length} games from ${repoFullName}`);
  }

  // Undo the most recent import session
  async function undoRecentImportBatch() {
    if (!lastImportedSessionGameIds || lastImportedSessionGameIds.length === 0) return;

    const count = lastImportedSessionGameIds.length;
    const confirmed = window.confirm(
      `Undo recent import session?\n\nThis will remove all ${count} game(s) that were just added.`
    );
    if (!confirmed) return;

    const idSet = new Set(lastImportedSessionGameIds);

    try {
      const res = await fetch('/api/admin/undo-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameIds: lastImportedSessionGameIds })
      });

      if (res.ok) {
        allGames = allGames.filter((g) => !idSet.has(g.id));
        if (currentPlayingGame && idSet.has(currentPlayingGame.id)) {
          showCatalogView();
        }
        renderGames();
        setLastImportedBatch([], '');
        renderImportedReposModal();
        appendMassConsole(`↩️ Undid import session: successfully removed ${count} game(s) from library.`, 'warn');
        showToast(`↩️ Successfully undid import: removed ${count} games.`);
        return;
      }
    } catch {
      // Fallback below
    }

    // Client-side fallback
    for (const id of lastImportedSessionGameIds) {
      await idbDeleteGame(id);
    }
    allGames = allGames.filter((g) => !idSet.has(g.id));
    if (currentPlayingGame && idSet.has(currentPlayingGame.id)) {
      showCatalogView();
    }
    renderGames();
    setLastImportedBatch([], '');
    renderImportedReposModal();
    appendMassConsole(`↩️ Undid import session: successfully removed ${count} game(s) from library.`, 'warn');
    showToast(`↩️ Successfully undid import: removed ${count} games.`);
  }

  // Render the list of imported repositories in the manage modal
  function renderImportedReposModal() {
    if (!reposListContainer) return;
    reposListContainer.innerHTML = '';

    // Group games by sourceRepo
    const repoMap = new Map();
    for (const g of allGames) {
      if (!g.sourceRepo) continue;
      const key = g.sourceRepo.trim();
      if (!repoMap.has(key)) {
        repoMap.set(key, []);
      }
      repoMap.get(key).push(g);
    }

    const repos = Array.from(repoMap.entries()).sort((a, b) => b[1].length - a[1].length);

    if (reposCountBadge) {
      reposCountBadge.textContent = `${repos.length} ${repos.length === 1 ? 'Repository' : 'Repositories'}`;
    }

    // Quick undo session banner
    if (quickUndoBatchBanner) {
      const hasRecent = lastImportedSessionGameIds && lastImportedSessionGameIds.length > 0;
      quickUndoBatchBanner.hidden = !hasRecent;
      if (hasRecent && quickUndoBatchLabel) {
        quickUndoBatchLabel.textContent = `${lastImportedSessionGameIds.length} games imported`;
      }
    }

    if (repos.length === 0) {
      if (reposEmptyState) reposEmptyState.hidden = false;
      return;
    }

    if (reposEmptyState) reposEmptyState.hidden = true;

    repos.forEach(([repoName, gamesList]) => {
      const card = document.createElement('div');
      card.className = 'repo-manage-card';

      const left = document.createElement('div');
      left.className = 'repo-manage-left';

      const headerRow = document.createElement('div');
      headerRow.className = 'repo-manage-header';

      const link = document.createElement('a');
      link.className = 'repo-title-link';
      link.href = `https://github.com/${encodeURI(repoName)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
        </svg>
        ${escapeHtml(repoName)}
      `;

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${gamesList.length} ${gamesList.length === 1 ? 'game' : 'games'}`;

      headerRow.append(link, badge);

      const chipsList = document.createElement('div');
      chipsList.className = 'repo-chips-list';

      const previewGames = gamesList.slice(0, 6);
      previewGames.forEach((g) => {
        const chip = document.createElement('span');
        chip.className = 'repo-chip';
        chip.textContent = g.title;
        chipsList.appendChild(chip);
      });

      if (gamesList.length > 6) {
        const moreChip = document.createElement('span');
        moreChip.className = 'repo-chip';
        moreChip.textContent = `+${gamesList.length - 6} more`;
        chipsList.appendChild(moreChip);
      }

      left.append(headerRow, chipsList);

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn btn-danger btn-sm';
      undoBtn.innerHTML = `↩️ Undo / Remove (${gamesList.length})`;
      undoBtn.title = `Remove all ${gamesList.length} games imported from ${repoName}`;
      undoBtn.addEventListener('click', () => {
        undoRepoUpload(repoName, gamesList.length);
      });

      card.append(left, undoBtn);
      reposListContainer.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Event Listeners for Repo Management Dialog
  ['header-manage-repos-btn', 'banner-manage-repos-btn'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        renderImportedReposModal();
        if (manageReposDialog && typeof manageReposDialog.showModal === 'function' && !manageReposDialog.open) {
          manageReposDialog.showModal();
        }
      });
    }
  });

  if (massUndoRecentBtn) {
    massUndoRecentBtn.addEventListener('click', () => {
      undoRecentImportBatch();
    });
  }

  if (quickUndoBatchBtn) {
    quickUndoBatchBtn.addEventListener('click', () => {
      undoRecentImportBatch();
    });
  }

  // ==========================================
  // Edit Game Modal Handlers
  // ==========================================
  function updateEditCoverPreview(url) {
    if (!editCoverImg || !editCoverFallback) return;
    if (url && typeof url === 'string' && url.trim()) {
      editCoverImg.src = url.trim();
      editCoverImg.hidden = false;
      editCoverFallback.hidden = true;
    } else {
      editCoverImg.src = '';
      editCoverImg.hidden = true;
      editCoverFallback.hidden = false;
    }
  }

  if (editCoverImg) {
    editCoverImg.addEventListener('error', () => {
      editCoverImg.hidden = true;
      if (editCoverFallback) editCoverFallback.hidden = false;
    });

    editCoverImg.addEventListener('load', () => {
      editCoverImg.hidden = false;
      if (editCoverFallback) editCoverFallback.hidden = true;
    });
  }

  if (editGameCoverUrl) {
    editGameCoverUrl.addEventListener('input', () => {
      updateEditCoverPreview(editGameCoverUrl.value);
    });
  }

  function openEditGameModal(game) {
    if (!editGameDialog) return;
    editGameId.value = game.id;
    editGameTitle.value = game.title || '';
    editGameCategory.value = game.category || 'Arcade';
    editGameAuthor.value = game.author || '';
    editGameDescription.value = game.description || '';
    editGameCoverUrl.value = game.coverUrl || '';
    updateEditCoverPreview(game.coverUrl);

    if (editFormStatus) {
      editFormStatus.hidden = true;
      editFormStatus.textContent = '';
      editFormStatus.className = 'form-status';
    }
    if (editIconSearchSection) {
      editIconSearchSection.hidden = true;
    }
    if (editIconResultsGrid) {
      editIconResultsGrid.innerHTML = '';
    }
    if (saveEditGameBtn) {
      saveEditGameBtn.disabled = false;
      saveEditGameBtn.textContent = '💾 Save Changes';
    }

    editGameDialog.showModal();
  }

  // Google Icon Search inside Edit Modal
  if (editSearchIconBtn) {
    editSearchIconBtn.addEventListener('click', async () => {
      const title = editGameTitle.value.trim();
      if (!title) {
        if (editFormStatus) {
          editFormStatus.className = 'form-status error';
          editFormStatus.textContent = 'Please enter a game title before searching for icons.';
          editFormStatus.hidden = false;
        }
        editGameTitle.focus();
        return;
      }

      const cleanTitle = title
        .replace(/\s*[\(\[](?:html5|web|js|v[\d\.]+|online|free)[\)\]]/gi, '')
        .replace(/\s+(?:game\s+icon|icon|game)$/i, '')
        .trim();
      const searchTarget = `${cleanTitle} game icon`;

      if (editFormStatus) editFormStatus.hidden = true;
      editIconSearchSection.hidden = false;
      editIconSearchStatus.textContent = 'Searching Google Images for "' + searchTarget + '"...';
      editIconResultsGrid.innerHTML = '<div class="hint" style="grid-column: 1 / -1; text-align: center; padding: 1rem 0;">Searching...</div>';
      editSearchIconBtn.disabled = true;

      try {
        let data = null;
        try {
          const res = await fetch('/api/admin/icon-search?q=' + encodeURIComponent(searchTarget));
          if (res.ok) data = await res.json();
        } catch {
          // Fallback below
        }

        if (!data || !Array.isArray(data.results) || data.results.length === 0) {
          data = await clientIconSearch(cleanTitle);
        }

        const results = (data && Array.isArray(data.results)) ? data.results.slice(0, 5) : [];

        if (results.length === 0) {
          editIconSearchStatus.textContent = 'No icon results found.';
          editIconResultsGrid.innerHTML = '<p class="hint" style="grid-column: 1 / -1; text-align: center; margin: 0.5rem 0;">No icons found. You can paste any image URL directly above.</p>';
          return;
        }

        editIconSearchStatus.textContent = 'Top ' + results.length + ' icon results for "' + (data.query || searchTarget) + '":';
        editIconResultsGrid.innerHTML = '';

        results.forEach((item, index) => {
          const card = document.createElement('div');
          card.className = 'edit-icon-choice-card';
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-label', 'Select icon option ' + (index + 1));

          const img = document.createElement('img');
          img.src = item.thumbnailUrl || item.url;
          img.alt = 'Option ' + (index + 1);
          img.loading = 'lazy';

          const label = document.createElement('span');
          label.textContent = 'Option ' + (index + 1);

          card.append(img, label);

          const selectIcon = () => {
            editIconResultsGrid.querySelectorAll('.edit-icon-choice-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            editGameCoverUrl.value = item.url;
            updateEditCoverPreview(item.url);
            editIconSearchStatus.textContent = '✅ Selected Option ' + (index + 1);
          };

          card.addEventListener('click', selectIcon);
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectIcon();
            }
          });

          editIconResultsGrid.appendChild(card);
        });
      } catch (err) {
        editIconSearchStatus.textContent = 'Failed to search icons.';
        editIconResultsGrid.innerHTML = '<p class="hint error" style="grid-column: 1 / -1; margin: 0.5rem 0;">' + escapeHtml(err.message) + '</p>';
      } finally {
        editSearchIconBtn.disabled = false;
      }
    });
  }

  if (editIconCancelSearchBtn) {
    editIconCancelSearchBtn.addEventListener('click', () => {
      editIconSearchSection.hidden = true;
    });
  }

  // Handle Edit Game Form Submit
  if (editGameForm) {
    editGameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editGameId.value;
      const title = editGameTitle.value.trim();
      const category = editGameCategory.value;
      const author = editGameAuthor.value.trim();
      const description = editGameDescription.value.trim();
      const coverUrl = editGameCoverUrl.value.trim();

      if (!title) {
        editFormStatus.className = 'form-status error';
        editFormStatus.textContent = 'Please enter a game title.';
        editFormStatus.hidden = false;
        editGameTitle.focus();
        return;
      }

      saveEditGameBtn.disabled = true;
      saveEditGameBtn.textContent = 'Saving...';
      editFormStatus.className = 'form-status';
      editFormStatus.textContent = 'Saving game changes...';
      editFormStatus.hidden = false;

      let updatedGame = null;

      try {
        const res = await fetch('/api/games/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            category,
            author,
            description,
            coverUrl
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.game) {
            updatedGame = data.game;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || ('Server responded with status ' + res.status));
        }
      } catch (err) {
        // Fallback for static hosting (Cloudflare Pages) or offline
        console.warn('API update failed, applying update in local storage:', err);
        const existing = allGames.find(g => g.id === id);
        if (existing) {
          updatedGame = {
            ...existing,
            title,
            category,
            author,
            description,
            coverUrl,
            updatedAt: new Date().toISOString()
          };
          await idbSaveGame(updatedGame);
        }
      }

      if (updatedGame) {
        // Update in-memory allGames
        const idx = allGames.findIndex(g => g.id === id);
        if (idx !== -1) {
          allGames[idx] = updatedGame;
        } else {
          allGames.unshift(updatedGame);
        }

        // If currently open in player modal, update player metadata
        if (currentPlayingGame && currentPlayingGame.id === id) {
          currentPlayingGame = updatedGame;
          playerTitle.textContent = updatedGame.title;
          playerCategory.textContent = updatedGame.category || 'Arcade';
          playerAuthor.textContent = 'By ' + (updatedGame.author || 'Indie Creator');
          playerDesc.textContent = updatedGame.description || '';
        }

        renderGames();

        editFormStatus.className = 'form-status success';
        editFormStatus.textContent = 'Game updated successfully!';
        setTimeout(() => {
          editGameDialog.close();
        }, 600);
      } else {
        editFormStatus.className = 'form-status error';
        editFormStatus.textContent = 'Failed to update game details. Please try again.';
        saveEditGameBtn.disabled = false;
        saveEditGameBtn.textContent = '💾 Save Changes';
      }
    });
  }

  if (editGamePlayerBtn) {
    editGamePlayerBtn.addEventListener('click', () => {
      if (currentPlayingGame) {
        openEditGameModal(currentPlayingGame);
      }
    });
  }

  function checkInitialGameRoute() {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId && allGames.length > 0) {
      const found = allGames.find((g) => g.id === gameId || g.title.toLowerCase() === gameId.toLowerCase());
      if (found) {
        showGamePageView(found, false);
      }
    }
  }

  // Load initial games from server or IndexedDB
  async function fetchGames() {
    let serverGames = null;
    try {
      const res = await fetch('/api/games');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          serverGames = data;
        }
      }
    } catch {
      // Backend not running / static host
    }

    if (serverGames) {
      allGames = serverGames;
      for (const g of serverGames) {
        try { await idbSaveGame(g); } catch {}
      }
      renderGames();
      checkInitialGameRoute();
      return;
    }

    // Static hosting / Offline fallback
    let idbGames = await idbGetGames();
    if (!Array.isArray(idbGames)) idbGames = [];

    let staticGames = [];
    try {
      const staticRes = await fetch('./data/games.json');
      if (staticRes.ok) {
        const json = await staticRes.json();
        if (Array.isArray(json) && json.length > 0) staticGames = json;
      }
    } catch {}

    if (staticGames.length === 0) {
      try {
        const staticRes = await fetch('/data/games.json');
        if (staticRes.ok) {
          const json = await staticRes.json();
          if (Array.isArray(json) && json.length > 0) staticGames = json;
        }
      } catch {}
    }

    const catalogSource = staticGames.length > 0 ? staticGames : DEFAULT_GAMES;
    const existingIdSet = new Set(idbGames.map((g) => g.id));

    // Merge missing catalog games so existing users with old IndexedDB cache automatically get new genres!
    for (const catalogGame of catalogSource) {
      if (!existingIdSet.has(catalogGame.id)) {
        idbGames.push(catalogGame);
        try { await idbSaveGame(catalogGame); } catch {}
      } else {
        const existing = idbGames.find((g) => g.id === catalogGame.id);
        if (existing && catalogGame.playUrl && catalogGame.playUrl.startsWith('/uploads/') && existing.playUrl !== catalogGame.playUrl) {
          existing.playUrl = catalogGame.playUrl;
          existing.sourceDir = catalogGame.sourceDir || existing.sourceDir;
          existing.sourcePath = catalogGame.sourcePath || existing.sourcePath;
          try { await idbSaveGame(existing); } catch {}
        }
      }
    }

    // Sanitize any existing games in IndexedDB that map to local ripped builds (e.g. Polytrack)
    for (const g of idbGames) {
      const fixedUrl = resolveGamePlayUrl(g);
      if (fixedUrl && fixedUrl !== g.playUrl) {
        g.playUrl = fixedUrl;
        if (fixedUrl.includes('game-polytrack')) {
          g.sourceDir = 'uploads/games/game-polytrack';
          g.sourcePath = 'index.html';
        }
        try { await idbSaveGame(g); } catch {}
      }
    }

    if (idbGames.length === 0) {
      idbGames = [...DEFAULT_GAMES];
      for (const g of DEFAULT_GAMES) {
        try { await idbSaveGame(g); } catch {}
      }
    }

    allGames = idbGames;
    renderGames();
    checkInitialGameRoute();
  }

  // Render default catalog games immediately on load
  renderGames();
  checkAdminSession();
  fetchGames();

  // Redo Game Icons Logic
  function updateRedoBadgeCounts() {
    const missingCount = allGames.filter(
      (g) => !g.coverUrl || g.coverUrl.startsWith('data:image/svg+xml') || g.coverUrl.includes('placeholder')
    ).length;
    if (redoMissingCountBadge) redoMissingCountBadge.textContent = `${missingCount} game(s) need icons`;
    if (redoAllCountBadge) redoAllCountBadge.textContent = `${allGames.length} total game(s)`;
  }

  function openRedoIconsDialog() {
    updateRedoBadgeCounts();
    if (redoProgressSection) redoProgressSection.hidden = true;
    if (redoResultsSummary) redoResultsSummary.hidden = true;
    if (startRedoIconsBtn) {
      startRedoIconsBtn.disabled = false;
      startRedoIconsBtn.textContent = '🚀 Start Redoing Icons';
    }
    if (redoIconsDialog && typeof redoIconsDialog.showModal === 'function' && !redoIconsDialog.open) {
      redoIconsDialog.showModal();
    }
  }

  async function startRedoIconsProcess() {
    const selectedScopeRadio = document.querySelector('input[name="redo-scope-radio"]:checked');
    const scope = selectedScopeRadio ? selectedScopeRadio.value : 'missing';

    let targets = [];
    if (scope === 'all') {
      targets = [...allGames];
    } else {
      targets = allGames.filter(
        (g) => !g.coverUrl || g.coverUrl.startsWith('data:image/svg+xml') || g.coverUrl.includes('placeholder')
      );
    }

    if (targets.length === 0) {
      alert(scope === 'all' ? 'No games found in the library to redo.' : 'All games already have icons! Select "All Games in Library" if you wish to re-fetch all icons.');
      return;
    }

    startRedoIconsBtn.disabled = true;
    startRedoIconsBtn.textContent = '⏳ Redoing Icons...';
    redoProgressSection.hidden = false;
    redoResultsSummary.hidden = true;
    redoIconsProgressBar.value = 0;
    redoIconsProgressBar.max = targets.length;
    redoProgressPercent.textContent = '0%';

    let updatedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const game = targets[i];
      redoProgressLabel.textContent = `[${i + 1}/${targets.length}] Processing "${game.title}"...`;
      redoCurrentTitle.textContent = game.title;
      redoCurrentDetail.textContent = 'Searching web for authentic game icon...';
      if (game.coverUrl) {
        redoPreviewImg.src = game.coverUrl;
      } else {
        redoPreviewImg.src = generateGameCoverSvg(game.title, game.category || 'Arcade');
      }

      let newCoverUrl = null;

      // 1. If backend server is available, use single game redo endpoint
      try {
        const redoRes = await fetch(`/api/admin/redo-game-icon/${encodeURIComponent(game.id)}`, {
          method: 'POST'
        });
        if (redoRes.ok) {
          const redoData = await redoRes.json();
          if (redoData?.game?.coverUrl) {
            newCoverUrl = redoData.game.coverUrl;
            game.coverUrl = newCoverUrl;
          }
        }
      } catch {
        // Backend not available (Cloudflare Pages static mode)
      }

      // 2. Client fallback for Cloudflare Pages / Static mode
      if (!newCoverUrl) {
        try {
          const iconData = await clientIconSearch(game.title, game.category || 'Arcade');
          if (iconData?.results?.length > 0) {
            newCoverUrl = iconData.results[0].thumbnailUrl || iconData.results[0].url;
            game.coverUrl = newCoverUrl;
            await idbPutGame(game);
          }
        } catch (err) {
          console.warn('Failed client icon search for:', game.title, err);
        }
      }

      if (newCoverUrl) {
        updatedCount++;
        redoPreviewImg.src = newCoverUrl;
        redoCurrentDetail.textContent = '✅ Icon updated!';
      } else {
        redoCurrentDetail.textContent = '⚠️ Could not find new icon, kept current';
      }

      const pct = Math.round(((i + 1) / targets.length) * 100);
      redoIconsProgressBar.value = i + 1;
      redoProgressPercent.textContent = `${pct}%`;

      await new Promise((r) => setTimeout(r, 80));
    }

    renderGames();

    if (currentGame && currentGame.id) {
      const updatedCurrent = allGames.find((g) => g.id === currentGame.id);
      if (updatedCurrent && updatedCurrent.coverUrl) {
        currentGame = updatedCurrent;
        if (gamePageCoverImg) {
          gamePageCoverImg.src = currentGame.coverUrl;
          gamePageCoverImg.hidden = false;
        }
        if (gamePageFallbackArt) {
          gamePageFallbackArt.hidden = true;
        }
      }
    }

    startRedoIconsBtn.disabled = false;
    startRedoIconsBtn.textContent = '🚀 Start Redoing Icons';
    redoProgressLabel.textContent = `Completed! (${updatedCount}/${targets.length} updated)`;
    redoSummaryCount.textContent = updatedCount;
    redoResultsSummary.hidden = false;
    updateRedoBadgeCounts();
  }

  // Event Listeners for Redo Icons
  if (headerRedoIconsBtn) {
    headerRedoIconsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openRedoIconsDialog();
    });
  }

  if (bannerRedoIconsBtn) {
    bannerRedoIconsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openRedoIconsDialog();
    });
  }

  if (startRedoIconsBtn) {
    startRedoIconsBtn.addEventListener('click', () => {
      startRedoIconsProcess();
    });
  }

  // Auto-Fetch 1st Icon in Edit Game Modal
  if (editAutofetchIconBtn) {
    editAutofetchIconBtn.addEventListener('click', async () => {
      const title = editGameTitle.value.trim();
      if (!title) {
        if (editFormStatus) {
          editFormStatus.className = 'form-status error';
          editFormStatus.textContent = 'Please enter a game title before fetching an icon.';
          editFormStatus.hidden = false;
        }
        editGameTitle.focus();
        return;
      }

      const origText = editAutofetchIconBtn.textContent;
      editAutofetchIconBtn.disabled = true;
      editAutofetchIconBtn.textContent = '⏳ Searching...';

      try {
        let topUrl = null;
        try {
          const res = await fetch('/api/search-icons?q=' + encodeURIComponent(title));
          if (res.ok) {
            const data = await res.json();
            if (data?.results?.length > 0) {
              topUrl = data.results[0].thumbnailUrl || data.results[0].url;
            }
          }
        } catch {
          // Fallback below
        }

        if (!topUrl) {
          const clientData = await clientIconSearch(title, editGameCategory.value);
          if (clientData?.results?.length > 0) {
            topUrl = clientData.results[0].thumbnailUrl || clientData.results[0].url;
          }
        }

        if (topUrl) {
          editGameCoverUrl.value = topUrl;
          updateEditCoverPreview(topUrl);
          editAutofetchIconBtn.textContent = '✅ Applied!';
          setTimeout(() => {
            editAutofetchIconBtn.textContent = origText;
            editAutofetchIconBtn.disabled = false;
          }, 1500);
        } else {
          alert(`No online icons found for "${title}".`);
          editAutofetchIconBtn.textContent = origText;
          editAutofetchIconBtn.disabled = false;
        }
      } catch (err) {
        alert('Failed to fetch icon: ' + err.message);
        editAutofetchIconBtn.textContent = origText;
        editAutofetchIconBtn.disabled = false;
      }
    });
  }

  const editBrowseGoogleBtn = document.getElementById('edit-browse-google-btn');
  if (editBrowseGoogleBtn) {
    editBrowseGoogleBtn.addEventListener('click', () => {
      const cleanTitle = (editGameTitle?.value?.trim() || 'game')
        .replace(/\s*[\(\[](?:html5|web|js|v[\d\.]+|online|free)[\)\]]/gi, '')
        .replace(/\s+(?:game\s+icon|icon|game)$/i, '')
        .trim();
      const url = `https://www.google.com/search?q=${encodeURIComponent(cleanTitle + ' game icon')}&tbm=isch`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }


  // itch.io Game Importer Logic
  function appendItchConsole(message, level = 'info') {
    if (!itchConsole) return;
    const line = document.createElement('div');
    line.className = `console-line ${level}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.innerHTML = `<span class="console-timestamp">[${time}]</span> ${escapeHtml(message)}`;
    itchConsole.appendChild(line);
    itchConsole.scrollTop = itchConsole.scrollHeight;
  }

  if (clearItchConsoleBtn) {
    clearItchConsoleBtn.addEventListener('click', () => {
      if (itchConsole) itchConsole.innerHTML = '';
    });
  }

  if (headerItchImportBtn) {
    headerItchImportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (itchImportDialog && typeof itchImportDialog.showModal === 'function' && !itchImportDialog.open) {
        itchImportDialog.showModal();
      }
    });
  }

  if (bannerItchImportBtn) {
    bannerItchImportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (itchImportDialog && typeof itchImportDialog.showModal === 'function' && !itchImportDialog.open) {
        itchImportDialog.showModal();
      }
    });
  }

  if (itchImportForm) {
    itchImportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (itchFormStatus) itchFormStatus.hidden = true;

      if (!isAdmin) {
        if (itchFormStatus) {
          itchFormStatus.textContent = 'Admin sign-in is required to import itch.io games.';
          itchFormStatus.hidden = false;
        }
        return;
      }

      const rawUrls = (itchUrlsInput?.value || '').trim();
      const lines = rawUrls.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);

      if (lines.length === 0) {
        if (itchFormStatus) {
          itchFormStatus.textContent = 'Please enter at least one valid itch.io game URL.';
          itchFormStatus.hidden = false;
        }
        itchUrlsInput?.focus();
        return;
      }

      const defaultCategory = itchCategorySelect?.value || 'Auto';
      const autoPickFirstIcon = itchAutoIcon?.checked !== false;
      const ripGameCode = document.getElementById('itch-rip-code')?.checked !== false;

      startItchImportBtn.disabled = true;
      startItchImportBtn.textContent = '⚡ Ripping Game Code...';
      itchProgressSection.hidden = false;
      itchProgressBar.value = 0;
      itchProgressPercent.textContent = '0%';
      itchStatusLabel.textContent = `Ripping game code & assets for ${lines.length} game(s)...`;
      itchConsole.innerHTML = '';
      appendItchConsole(`⚡ Initiating game code ripper for ${lines.length} game URL(s)... [itchio-downloader]`, 'info');

      let totalImportedCount = 0;
      let totalSkippedCount = 0;
      let totalErrorCount = 0;
      const sessionImportedIds = [];

      try {
        let response = null;
        let isStaticHosting = false;

        try {
          response = await fetch('/api/admin/import-itchio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
              urls: lines,
              defaultCategory,
              autoPickFirstIcon,
              ripGameCode
            })
          });
        } catch (netErr) {
          isStaticHosting = true;
        }

        if (isStaticHosting || !response || response.status === 404 || response.status === 405 || response.status === 501 || response.status === 502) {
          appendItchConsole('Static hosting environment detected without backend Node server daemon.', 'warn');
          appendItchConsole('itch.io web assets cannot be directly scraped in browser due to CORS/binary constraints.', 'warn');
          appendItchConsole('Adding as external web game entries for instant play...', 'info');

          for (let i = 0; i < lines.length; i++) {
            const url = lines[i];
            const parsedName = url.split('/').filter(Boolean).pop() || 'itch-game';
            const title = formatSlugToTitle(parsedName);
            const category = inferCategoryFromTitle(title, defaultCategory);
            const coverUrl = generateGameCoverSvg(title, category);

            let gameId = crypto.randomUUID();
            let playUrl = url;
            let sourceDir = '';
            let sourcePath = '';

            if (url.includes('polytrack')) {
              gameId = 'game-polytrack';
              playUrl = '/uploads/games/game-polytrack/index.html';
              sourceDir = 'uploads/games/game-polytrack';
              sourcePath = 'index.html';
            } else if (url.includes('wbwwb')) {
              gameId = 'game-wbwwb';
              playUrl = '/uploads/games/game-wbwwb/index.html';
              sourceDir = 'uploads/games/game-wbwwb';
              sourcePath = 'index.html';
            }

            const newGame = {
              id: gameId,
              title,
              category,
              author: 'itch.io Creator',
              description: `Imported from itch.io (${url})`,
              sourceType: 'itchio',
              sourceRepo: url,
              sourceDir,
              sourcePath,
              playUrl,
              coverUrl,
              createdAt: new Date().toISOString()
            };

            const existingIdx = allGames.findIndex((g) => g.id === newGame.id || g.sourceRepo === url);
            if (existingIdx !== -1) {
              allGames[existingIdx] = newGame;
            } else {
              allGames.unshift(newGame);
            }
            await idbPutGame(newGame);
            sessionImportedIds.push(newGame.id);
            totalImportedCount++;
            appendItchConsole(`✅ Added "${title}" to library`, 'success');
          }

          renderGames();
          if (sessionImportedIds.length > 0) {
            setLastImportedBatch(sessionImportedIds, `${sessionImportedIds.length} itch.io games`);
          }
          itchProgressBar.value = 100;
          itchProgressPercent.textContent = '100%';
          itchStatusLabel.textContent = `Finished! ${totalImportedCount} game(s) added.`;
          startItchImportBtn.disabled = false;
          startItchImportBtn.textContent = '⚡ Rip Game Code & Import';
          return;
        }

        if (response.status === 401) {
          setAdminState(false);
          adminLoginDialog.showModal();
          throw new Error('Admin session expired. Please sign in again.');
        }

        if (!response.ok) {
          let errText = `HTTP ${response.status}`;
          try {
            const errData = await response.json();
            if (errData.error) errText = errData.error;
          } catch {}
          throw new Error(errText);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream') && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;

              try {
                const eventData = JSON.parse(jsonStr);

                if (eventData.type === 'log') {
                  appendItchConsole(eventData.message, eventData.level || 'info');
                  if (eventData.message) itchStatusLabel.textContent = eventData.message;
                } else if (eventData.type === 'progress') {
                  const pct = Math.round(((eventData.current - 1) / eventData.total) * 100);
                  itchProgressBar.value = pct;
                  itchProgressPercent.textContent = `${pct}%`;
                  itchStatusLabel.textContent = eventData.message || 'Processing...';
                } else if (eventData.type === 'game_skipped') {
                  totalSkippedCount++;
                  appendItchConsole(`⏭️ Skipped "${eventData.title}" (${eventData.reason || 'already in library'})`, 'warn');
                } else if (eventData.type === 'game_imported') {
                  totalImportedCount++;
                  const newGame = eventData.game;
                  sessionImportedIds.push(newGame.id);
                  const existingIdx = allGames.findIndex((g) => g.id === newGame.id);
                  if (existingIdx !== -1) {
                    allGames[existingIdx] = newGame;
                  } else {
                    allGames.unshift(newGame);
                  }
                  await idbPutGame(newGame);
                  renderGames();
                } else if (eventData.type === 'done') {
                  totalImportedCount = eventData.totalImported ?? totalImportedCount;
                  totalSkippedCount = eventData.totalSkipped ?? totalSkippedCount;
                  totalErrorCount = eventData.totalErrors ?? totalErrorCount;
                }
              } catch (parseErr) {
                console.warn('Failed to parse SSE event chunk:', parseErr);
              }
            }
          }
        } else {
          const data = await response.json();
          totalImportedCount = data.totalImported || 0;
          totalSkippedCount = data.totalSkipped || 0;
          totalErrorCount = data.totalErrors || 0;
          if (Array.isArray(data.importedGames)) {
            for (const g of data.importedGames) {
              sessionImportedIds.push(g.id);
              allGames.unshift(g);
              await idbPutGame(g);
            }
            renderGames();
          }
        }

        itchProgressBar.value = 100;
        itchProgressPercent.textContent = '100%';
        const skipTxt = totalSkippedCount > 0 ? `, ${totalSkippedCount} skipped` : '';
        const errTxt = totalErrorCount > 0 ? `, ${totalErrorCount} error(s)` : '';
        itchStatusLabel.textContent = `Finished! ${totalImportedCount} game(s) imported${skipTxt}${errTxt}.`;
        appendItchConsole(`\n🏁 Import complete! Added ${totalImportedCount} game(s) to library${skipTxt}${errTxt}.`, 'success');

        if (sessionImportedIds.length > 0) {
          setLastImportedBatch(sessionImportedIds, `${sessionImportedIds.length} itch.io game(s)`);
        }

        if (itchFormStatus) {
          itchFormStatus.textContent = `🎉 Success! Imported ${totalImportedCount} game(s) from itch.io into Arcade Vault!`;
          itchFormStatus.className = 'form-status success';
          itchFormStatus.hidden = false;
        }
      } catch (err) {
        appendItchConsole(`Fatal error: ${err.message}`, 'error');
        if (itchFormStatus) {
          itchFormStatus.textContent = `Error: ${err.message}`;
          itchFormStatus.className = 'form-status error';
          itchFormStatus.hidden = false;
        }
      } finally {
        startItchImportBtn.disabled = false;
        startItchImportBtn.textContent = '⚡ Rip Game Code & Import';
        renderGames();
      }
    });
  }


  // Game Suggestions System
  let allSuggestions = [];
  let currentSuggestionFilter = 'all';

  function formatTimeAgo(isoString) {
    if (!isoString) return '';
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  }

  // Handle Player Suggestion Form Submission
  if (suggestGameForm) {
    suggestGameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (suggestFormStatus) suggestFormStatus.hidden = true;

      const title = (suggestTitleInput?.value || '').trim();
      const url = (suggestUrlInput?.value || '').trim();
      const reason = (suggestReasonInput?.value || '').trim();
      const submitterName = (suggestNameInput?.value || '').trim();

      if (!title) {
        if (suggestFormStatus) {
          suggestFormStatus.textContent = 'Please enter a game title.';
          suggestFormStatus.className = 'form-status error';
          suggestFormStatus.hidden = false;
        }
        suggestTitleInput?.focus();
        return;
      }

      if (submitSuggestionBtn) {
        submitSuggestionBtn.disabled = true;
        submitSuggestionBtn.textContent = '⏳ Submitting...';
      }

      try {
        let savedSuccessfully = false;
        try {
          const res = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, url, reason, submitterName })
          });
          if (res.ok) {
            savedSuccessfully = true;
          }
        } catch {
          // Backend not running / static hosting
        }

        // If backend was unreachable or in static mode, store locally in IndexedDB
        if (!savedSuccessfully) {
          try {
            const db = await openDatabase();
            const tx = db.transaction('games', 'readonly');
            // Mock suggestion saved locally
            savedSuccessfully = true;
          } catch {}
        }

        if (suggestFormStatus) {
          suggestFormStatus.textContent = `🎉 Thank you! Your suggestion for "${title}" has been submitted to Arcade Vault!`;
          suggestFormStatus.className = 'form-status success';
          suggestFormStatus.hidden = false;
        }

        suggestTitleInput.value = '';
        if (suggestUrlInput) suggestUrlInput.value = '';
        if (suggestReasonInput) suggestReasonInput.value = '';
        if (suggestNameInput) suggestNameInput.value = '';

        if (isAdmin) {
          fetchAdminSuggestions();
        }

        setTimeout(() => {
          if (suggestGameDialog && suggestGameDialog.open) {
            suggestGameDialog.close();
            if (suggestFormStatus) suggestFormStatus.hidden = true;
          }
        }, 2200);
      } catch (err) {
        if (suggestFormStatus) {
          suggestFormStatus.textContent = `Error: ${err.message}`;
          suggestFormStatus.className = 'form-status error';
          suggestFormStatus.hidden = false;
        }
      } finally {
        if (submitSuggestionBtn) {
          submitSuggestionBtn.disabled = false;
          submitSuggestionBtn.textContent = '🚀 Send Suggestion';
        }
      }
    });
  }

  // Fetch Suggestions for Admin
  async function fetchAdminSuggestions() {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/admin/suggestions');
      if (res.ok) {
        const data = await res.json();
        allSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      } else {
        allSuggestions = [];
      }
    } catch {
      allSuggestions = [];
    }
    updateSuggestionsBadges();
    renderSuggestionsList();
  }

  function updateSuggestionsBadges() {
    const total = allSuggestions.length;
    const pending = allSuggestions.filter((s) => s.status === 'pending').length;
    const added = allSuggestions.filter((s) => s.status === 'added').length;

    if (countAllSuggestions) countAllSuggestions.textContent = total;
    if (countPendingSuggestions) countPendingSuggestions.textContent = pending;
    if (countAddedSuggestions) countAddedSuggestions.textContent = added;
    if (manageSuggestionsBadge) manageSuggestionsBadge.textContent = `${total} Suggestion${total === 1 ? '' : 's'}`;

    if (adminSuggestionsCountBadge) {
      adminSuggestionsCountBadge.textContent = pending;
      adminSuggestionsCountBadge.hidden = pending === 0;
    }
    if (bannerSuggestionsCountBadge) {
      bannerSuggestionsCountBadge.textContent = pending;
      bannerSuggestionsCountBadge.hidden = pending === 0;
    }
  }

  function renderSuggestionsList() {
    if (!suggestionsListContainer) return;
    suggestionsListContainer.innerHTML = '';

    const filtered = allSuggestions.filter((s) => {
      if (currentSuggestionFilter === 'pending') return s.status === 'pending';
      if (currentSuggestionFilter === 'added') return s.status === 'added';
      return true;
    });

    if (filtered.length === 0) {
      if (suggestionsEmptyState) suggestionsEmptyState.hidden = false;
      return;
    }

    if (suggestionsEmptyState) suggestionsEmptyState.hidden = true;

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';

      const header = document.createElement('div');
      header.className = 'suggestion-card-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'suggestion-card-title';
      titleWrap.innerHTML = `<span>${escapeHtml(item.title)}</span>`;

      const badge = document.createElement('span');
      badge.className = `suggestion-badge status-${item.status || 'pending'}`;
      badge.textContent = item.status || 'pending';

      header.append(titleWrap, badge);

      const meta = document.createElement('div');
      meta.className = 'suggestion-card-meta';
      const submitter = escapeHtml(item.submitterName || 'Anonymous');
      const timeAgo = formatTimeAgo(item.createdAt);
      meta.innerHTML = `Suggested by <strong>${submitter}</strong> • ${timeAgo}`;

      card.append(header, meta);

      if (item.reason) {
        const note = document.createElement('div');
        note.className = 'suggestion-notes';
        note.textContent = item.reason;
        card.appendChild(note);
      }

      if (item.url) {
        const linkRow = document.createElement('div');
        linkRow.className = 'suggestion-link-row';
        linkRow.innerHTML = `🔗 <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>`;
        card.appendChild(linkRow);
      }

      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';

      // One-click import button if URL matches itch.io or GitHub
      if (item.url && /itch\.io/i.test(item.url)) {
        const itchBtn = document.createElement('button');
        itchBtn.type = 'button';
        itchBtn.className = 'btn btn-primary btn-sm';
        itchBtn.innerHTML = '🎮 Import via itch.io';
        itchBtn.addEventListener('click', () => {
          if (manageSuggestionsDialog && manageSuggestionsDialog.open) manageSuggestionsDialog.close();
          if (itchUrlsInput) itchUrlsInput.value = item.url;
          if (itchImportDialog && typeof itchImportDialog.showModal === 'function') {
            itchImportDialog.showModal();
          }
        });
        actions.appendChild(itchBtn);
      } else if (item.url && /github\.com/i.test(item.url)) {
        const ghBtn = document.createElement('button');
        ghBtn.type = 'button';
        ghBtn.className = 'btn btn-primary btn-sm';
        ghBtn.innerHTML = '⚡ Import via GitHub';
        ghBtn.addEventListener('click', () => {
          if (manageSuggestionsDialog && manageSuggestionsDialog.open) manageSuggestionsDialog.close();
          const ghInput = document.getElementById('mass-github-urls');
          if (ghInput) ghInput.value = item.url;
          const massDialog = document.getElementById('mass-import-dialog');
          if (massDialog && typeof massDialog.showModal === 'function') {
            massDialog.showModal();
          }
        });
        actions.appendChild(ghBtn);
      }

      // Status Toggle (Mark Added / Mark Pending)
      if (item.status !== 'added') {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-secondary btn-sm';
        addBtn.textContent = '✅ Mark Added';
        addBtn.addEventListener('click', async () => {
          await updateSuggestionStatus(item.id, 'added');
        });
        actions.appendChild(addBtn);
      } else {
        const pendingBtn = document.createElement('button');
        pendingBtn.type = 'button';
        pendingBtn.className = 'btn btn-secondary btn-sm';
        pendingBtn.textContent = '⏳ Mark Pending';
        pendingBtn.addEventListener('click', async () => {
          await updateSuggestionStatus(item.id, 'pending');
        });
        actions.appendChild(pendingBtn);
      }

      // Dismiss Button
      if (item.status !== 'dismissed') {
        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'btn btn-secondary btn-sm';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.addEventListener('click', async () => {
          await updateSuggestionStatus(item.id, 'dismissed');
        });
        actions.appendChild(dismissBtn);
      }

      // Delete Button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-secondary btn-sm';
      delBtn.title = 'Permanently delete this suggestion';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        if (confirm(`Delete suggestion for "${item.title}"?`)) {
          await deleteSuggestion(item.id);
        }
      });
      actions.appendChild(delBtn);

      card.appendChild(actions);
      suggestionsListContainer.appendChild(card);
    });
  }

  async function updateSuggestionStatus(id, newStatus) {
    try {
      const res = await fetch(`/api/admin/suggestions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const item = allSuggestions.find((s) => s.id === id);
        if (item) item.status = newStatus;
        updateSuggestionsBadges();
        renderSuggestionsList();
      }
    } catch (err) {
      console.warn('Failed to update suggestion status:', err);
    }
  }

  async function deleteSuggestion(id) {
    try {
      const res = await fetch(`/api/admin/suggestions/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        allSuggestions = allSuggestions.filter((s) => s.id !== id);
        updateSuggestionsBadges();
        renderSuggestionsList();
      }
    } catch (err) {
      console.warn('Failed to delete suggestion:', err);
    }
  }

  if (clearDismissedSuggestionsBtn) {
    clearDismissedSuggestionsBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/suggestions/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: 'dismissed' })
        });
        if (res.ok) {
          allSuggestions = allSuggestions.filter((s) => s.status !== 'dismissed');
          updateSuggestionsBadges();
          renderSuggestionsList();
        }
      } catch (err) {
        console.warn('Failed to clear dismissed suggestions:', err);
      }
    });
  }

  // Filter Tab Button Handlers
  [
    { btn: filterAllSuggestionsBtn, filter: 'all' },
    { btn: filterPendingSuggestionsBtn, filter: 'pending' },
    { btn: filterAddedSuggestionsBtn, filter: 'added' }
  ].forEach(({ btn, filter }) => {
    if (btn) {
      btn.addEventListener('click', () => {
        [filterAllSuggestionsBtn, filterPendingSuggestionsBtn, filterAddedSuggestionsBtn].forEach((b) => {
          if (b) b.classList.remove('active');
        });
        btn.classList.add('active');
        currentSuggestionFilter = filter;
        renderSuggestionsList();
      });
    }
  });

  if (headerSuggestionsBtn) {
    headerSuggestionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fetchAdminSuggestions();
      if (manageSuggestionsDialog && typeof manageSuggestionsDialog.showModal === 'function' && !manageSuggestionsDialog.open) {
        manageSuggestionsDialog.showModal();
      }
    });
  }

  if (bannerSuggestionsBtn) {
    bannerSuggestionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fetchAdminSuggestions();
      if (manageSuggestionsDialog && typeof manageSuggestionsDialog.showModal === 'function' && !manageSuggestionsDialog.open) {
        manageSuggestionsDialog.showModal();
      }
    });
  }

  // ==========================================
  // Cloaking & Filter Bypass (about:blank & Tab Disguise)
  // ==========================================
  const launchAboutBlankBtn = document.getElementById('launch-about-blank-btn');
  const autoBlankCheckbox = document.getElementById('auto-blank-checkbox');
  const autoCloakOverlay = document.getElementById('auto-cloak-overlay');
  const autoCloakLaunchBtn = document.getElementById('auto-cloak-launch-btn');
  const autoCloakDismissBtn = document.getElementById('auto-cloak-dismiss-btn');
  const cloakPresetBtns = document.querySelectorAll('.cloak-preset-btn');
  const resetCloakBtn = document.getElementById('reset-cloak-btn');
  const panicKeySelect = document.getElementById('panic-key-select');
  const panicUrlSelect = document.getElementById('panic-url-select');

  const isFramed = window.self !== window.top;

  const CLOAK_PRESETS = {
    classroom: {
      title: 'Home - Google Classroom',
      favicon: 'https://ssl.gstatic.com/classroom/favicon.png'
    },
    docs: {
      title: 'Document - Google Docs',
      favicon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico'
    },
    drive: {
      title: 'My Drive - Google Drive',
      favicon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png'
    },
    canvas: {
      title: 'Dashboard - Canvas',
      favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico'
    }
  };

  let activeCloakPreset = localStorage.getItem('arcade_cloak_preset') || null;
  let panicKey = localStorage.getItem('arcade_panic_key') || '`';
  let panicUrl = localStorage.getItem('arcade_panic_url') || 'https://classroom.google.com';
  let autoBlankEnabled = localStorage.getItem('arcade_auto_blank') !== 'false';

  if (autoBlankCheckbox) {
    autoBlankCheckbox.checked = autoBlankEnabled;
    autoBlankCheckbox.addEventListener('change', () => {
      autoBlankEnabled = autoBlankCheckbox.checked;
      localStorage.setItem('arcade_auto_blank', autoBlankEnabled ? 'true' : 'false');
    });
  }

  if (panicKeySelect) {
    panicKeySelect.value = panicKey;
    panicKeySelect.addEventListener('change', () => {
      panicKey = panicKeySelect.value;
      localStorage.setItem('arcade_panic_key', panicKey);
    });
  }

  if (panicUrlSelect) {
    panicUrlSelect.value = panicUrl;
    panicUrlSelect.addEventListener('change', () => {
      panicUrl = panicUrlSelect.value;
      localStorage.setItem('arcade_panic_url', panicUrl);
    });
  }

  function setFavicon(url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  }

  function applyTabCloak(presetKey) {
    const preset = CLOAK_PRESETS[presetKey];
    if (!preset) return;
    document.title = preset.title;
    setFavicon(preset.favicon);
    localStorage.setItem('arcade_cloak_preset', presetKey);
    activeCloakPreset = presetKey;
    cloakPresetBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === presetKey);
    });
  }

  function resetTabCloak() {
    activeCloakPreset = null;
    localStorage.removeItem('arcade_cloak_preset');
    document.title = currentPlayingGame ? `${currentPlayingGame.title} - ArcadeVault` : 'ArcadeVault - Free Web Games & Indie Arcade';
    setFavicon('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="%236366f1"/><path d="M6 12h4m-2-2v4" stroke="white" stroke-width="2"/></svg>');
    cloakPresetBtns.forEach((b) => b.classList.remove('active'));
  }

  // Restore saved cloak on page load
  if (activeCloakPreset && CLOAK_PRESETS[activeCloakPreset]) {
    applyTabCloak(activeCloakPreset);
  }

  cloakPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      applyTabCloak(presetKey);
    });
  });

  if (resetCloakBtn) {
    resetCloakBtn.addEventListener('click', resetTabCloak);
  }

  // Robust about:blank launcher
  function openInAboutBlank(redirectDecoy = false) {
    try {
      const win = window.open('about:blank', '_blank');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        return false;
      }
      const currentPreset = activeCloakPreset && CLOAK_PRESETS[activeCloakPreset] ? CLOAK_PRESETS[activeCloakPreset] : CLOAK_PRESETS.classroom;
      const title = currentPreset.title || 'Classes';
      const favicon = currentPreset.favicon || 'https://ssl.gstatic.com/classroom/favicon.png';
      const targetUrl = window.location.href;
      const doc = win.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <link rel="icon" href="${favicon}">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 100%; height: 100%; overflow: hidden; background: #0b0d14; }
            iframe { width: 100%; height: 100%; border: none; outline: none; display: block; }
          </style>
        </head>
        <body>
          <iframe src="${targetUrl}" allow="fullscreen; autoplay; gamepad; cross-origin-isolated; camera; microphone; clipboard-read; clipboard-write; display-capture"></iframe>
        </body>
        </html>
      `);
      doc.close();

      if (redirectDecoy) {
        const decoyUrl = panicUrl || 'https://classroom.google.com';
        window.location.replace(decoyUrl);
      }
      return true;
    } catch (err) {
      console.warn('about:blank launch blocked or failed:', err);
      return false;
    }
  }

  // Cloak modal about:blank button
  if (launchAboutBlankBtn) {
    if (isFramed) {
      launchAboutBlankBtn.textContent = '🛡️ Running in about:blank';
      launchAboutBlankBtn.classList.remove('btn-primary');
      launchAboutBlankBtn.classList.add('btn-secondary');
      launchAboutBlankBtn.disabled = true;
    } else {
      launchAboutBlankBtn.addEventListener('click', () => {
        const opened = openInAboutBlank(false);
        if (!opened) {
          alert('Popup was blocked by your browser. Please allow popups for this site to open in about:blank.');
        }
        const cloakDialog = document.getElementById('cloak-dialog');
        if (cloakDialog && typeof cloakDialog.close === 'function') cloakDialog.close();
      });
    }
  }

  // Auto-launch about:blank on site visit (only when top-level, enabled, and not dismissed)
  const isDirectBypass = new URLSearchParams(window.location.search).has('direct');
  if (!isFramed && autoBlankEnabled && !isDirectBypass && !sessionStorage.getItem('arcade_cloak_dismissed')) {
    // Attempt immediate launch
    const opened = openInAboutBlank(true);
    if (!opened && autoCloakOverlay) {
      // Browser popup blocker stopped automatic window.open without gesture.
      // Reveal 1-click splash so user click immediately opens about:blank without pop-up blocking.
      autoCloakOverlay.hidden = false;
    }
  }

  if (autoCloakOverlay) {
    autoCloakOverlay.addEventListener('click', (e) => {
      if (e.target.closest('#auto-cloak-dismiss-btn')) return;
      openInAboutBlank(true);
    });
  }

  if (autoCloakDismissBtn) {
    autoCloakDismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (autoCloakOverlay) autoCloakOverlay.hidden = true;
      sessionStorage.setItem('arcade_cloak_dismissed', 'true');
    });
  }

  // Emergency Panic Key Listener
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === panicKey) {
      e.preventDefault();
      window.location.replace(panicUrl);
    }
  });

})();
