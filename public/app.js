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

  UserInvalidFallback.init(uploadForm);
  UserInvalidFallback.init(adminLoginForm);
  if (massImportForm) UserInvalidFallback.init(massImportForm);
  if (editGameForm) UserInvalidFallback.init(editGameForm);

  let allGames = [];
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

  // Client-side fallback icon search (for Cloudflare Pages static hosting)
  async function clientIconSearch(gameTitle) {
    const query = `${gameTitle} icon`;
    const results = [];
    try {
      const iRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(gameTitle)}&entity=software&limit=5`
      );
      if (iRes.ok) {
        const data = await iRes.json();
        for (const item of data.results || []) {
          const art = item.artworkUrl512 || item.artworkUrl100;
          if (art) {
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
      // Ignore
    }
    return { query, results: results.slice(0, 5) };
  }

  // Transition from Step 1 (Upload) to Step 2 (Select Icon)
  async function enterSelectIconStep(createdGame) {
    pendingIconGame = createdGame;
    const expectedQuery = /\bicon$/i.test(createdGame.title.trim())
      ? createdGame.title.trim()
      : `${createdGame.title.trim()} icon`;

    uploadDialogTitle.textContent = `Select Icon — ${createdGame.title}`;
    stepTracker1.className = 'step-done';
    stepTracker1.removeAttribute('aria-current');
    stepTracker2.className = 'step-active';
    stepTracker2.setAttribute('aria-current', 'step');

    uploadForm.hidden = true;
    iconSelectForm.hidden = false;
    iconSearchQueryBadge.textContent = expectedQuery;
    iconLoadingQuery.textContent = `"${expectedQuery}"`;
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
    if (sourceType === 'url') {
      playUrl = gameUrl;
    } else if (gameFile && gameFile instanceof File) {
      playUrl = URL.createObjectURL(gameFile);
    }

    const newGame = {
      id: crypto.randomUUID(),
      title,
      category,
      author: author || 'Indie Creator',
      description: description || 'No description provided.',
      sourceType,
      playUrl,
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
    const gameToLaunch = pendingIconGame;
    uploadDialog.close();
    if (gameToLaunch) {
      openGamePlayer(gameToLaunch);
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
    if (/puzzle|2048|tetris|match|block|sudoku|chess|wordle|minesweeper|cut the rope/i.test(lower)) return 'Puzzle';
    if (/mario|sonic|retro|arcade|pacman|pac-man|space invaders|galaga|asteroids|pong|snake|atari|nes|gba|doom/i.test(lower)) return 'Retro';
    if (/platform|jump|runner|run|climb|vex|geometry dash|ovo|doodle/i.test(lower)) return 'Platformer';
    if (/strategy|defense|tower|card|tactics|bloons|idle|clicker|tycoon/i.test(lower)) return 'Strategy';
    if (/rpg|quest|adventure|dungeon|pokemon|zelda|final fantasy/i.test(lower)) return 'RPG';
    if (/action|shooter|bullet|fight|combat|ninja|racing|hexgl|drive|speed|slope|1v1|krunker|gun/i.test(lower)) return 'Action';
    return 'Arcade';
  }

  // Client-side fallback mass import (for Cloudflare Pages static hosting)
  async function handleClientSideMassImport(lines, defaultCategory, autoPickFirstIcon, githubToken = '') {
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

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

        if (autoPickFirstIcon) {
          massStatusLabel.textContent = `[${gIdx + 1}/${detectedGames.length}] Fetching icon for "${title}"...`;
          const iconData = await clientIconSearch(title);
          if (iconData?.results?.length > 0) {
            coverUrl = iconData.results[0].thumbnailUrl || iconData.results[0].url;
            appendMassConsole(`[${gIdx + 1}/${detectedGames.length}] Applied 1st icon result for "${title}"`, 'info');
          }
        }

        if (!coverUrl) {
          coverUrl = findRepoIconForGame(treeData.files, gameItem.gameDir, owner, repo, resolvedBranch);
        }

        const category = inferCategoryFromTitle(title, defaultCategory);

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
          }
          renderGames();
          totalImportedCount = result.importedGames.length;
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
    renderGames();
  }

  // Render Game Cards
  function renderGames() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = allGames.filter((game) => {
      const matchesCat = activeCategory === 'All' || game.category === activeCategory;
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
      const article = document.createElement('article');
      article.className = 'game-card';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'card-thumb-wrap';

      if (game.coverUrl) {
        const img = document.createElement('img');
        img.src = game.coverUrl;
        img.alt = `${game.title} icon`;
        img.width = 640;
        img.height = 360;
        img.loading = 'lazy';
        thumbWrap.appendChild(img);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'card-fallback-art';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = game.title;
        thumbWrap.appendChild(fallback);
      }

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
      playBtn.addEventListener('click', () => openGamePlayer(game));

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
      gamesGrid.appendChild(article);
    });
  }

  // Open Game Player Modal
  function openGamePlayer(game) {
    currentPlayingGame = game;
    playerTitle.textContent = game.title;
    playerCategory.textContent = game.category || 'Arcade';
    playerAuthor.textContent = `By ${game.author || 'Indie Creator'}`;
    playerDesc.textContent = game.description || '';
    openNewTabLink.href = game.playUrl;
    if (editGamePlayerBtn) editGamePlayerBtn.hidden = !isAdmin;
    deleteGameBtn.hidden = !isAdmin;
    gameIframe.src = game.playUrl;
    playerDialog.showModal();
  }

  playerDialog.addEventListener('close', () => {
    gameIframe.src = 'about:blank';
    currentPlayingGame = null;
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

      if (editFormStatus) editFormStatus.hidden = true;
      editIconSearchSection.hidden = false;
      editIconSearchStatus.textContent = 'Searching Google Images for "' + title + ' icon"...';
      editIconResultsGrid.innerHTML = '<div class="hint" style="grid-column: 1 / -1; text-align: center; padding: 1rem 0;">Searching...</div>';
      editSearchIconBtn.disabled = true;

      try {
        let data = null;
        try {
          const res = await fetch('/api/admin/icon-search?q=' + encodeURIComponent(title));
          if (res.ok) data = await res.json();
        } catch {
          // Fallback below
        }

        if (!data || !Array.isArray(data.results) || data.results.length === 0) {
          data = await clientIconSearch(title);
        }

        const results = (data && Array.isArray(data.results)) ? data.results.slice(0, 5) : [];

        if (results.length === 0) {
          editIconSearchStatus.textContent = 'No icon results found.';
          editIconResultsGrid.innerHTML = '<p class="hint" style="grid-column: 1 / -1; text-align: center; margin: 0.5rem 0;">No icons found. You can paste any image URL directly above.</p>';
          return;
        }

        editIconSearchStatus.textContent = 'Top ' + results.length + ' icon results for "' + (data.query || title + ' icon') + '":';
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

  // Load initial games from server or IndexedDB
  async function fetchGames() {
    try {
      const res = await fetch('/api/games');
      if (res.ok) {
        allGames = await res.json();
        renderGames();
        return;
      }
    } catch {
      // Fallback below
    }

    // Static hosting fallback
    const idbGames = await idbGetGames();
    allGames = idbGames;
    renderGames();
  }

  checkAdminSession();
  fetchGames();
})();
