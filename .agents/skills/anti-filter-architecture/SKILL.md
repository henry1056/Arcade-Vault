---
name: anti-filter-architecture
description: Principles, evasion techniques, and implementation blueprints for filter resilience, about:blank cloaking, tab disguises, in-browser proxy interception, and edge mirror deployments in web game portals.
---

# Anti-Filter & Web Unblocker Architecture

This skill provides architectural patterns, implementation blueprints, and operational techniques used by modern web game portals and unblocker networks (e.g. Titanium Network, Selenite, Ultraviolet, 3kh0) to maintain access against school and enterprise content filters.

---

## 1. Filter Inspection Layers

Content filtering systems operate across three primary layers. Countermeasures must address the specific layer that triggers the block:

| Layer | Technologies | How It Inspects | Primary Evasion Technique |
| :--- | :--- | :--- | :--- |
| **Network & DNS** | Fortinet, Palo Alto, Cisco Umbrella, DNS Sinkholes | Checks domain name in DNS lookups and TLS `ClientHello` Server Name Indication (SNI). | Edge mirror domain rotation, CDN domain fronting, and encrypted proxy tunnels. |
| **Browser Extension** | GoGuardian, Securly, Lightspeed, Linewize | Runs extension background/content scripts monitoring top-level active tab URLs and DOM keywords. | `about:blank` full-screen embedding, Blob URL generation, and decoy redirect switching. |
| **Visual Monitoring** | Apple Classroom, LanSchool, GoGuardian Teacher | Takes real-time screen captures or lists active browser window titles on teacher dashboards. | Tab favicon/title camouflage (Classroom/Docs presets) and instant Panic Keys (`~` redirect). |

---

## 2. Client-Side Cloaking Blueprint

### `about:blank` Embedding Pattern
Chrome and Chromium-based extensions are prohibited by browser security policy from running content scripts or querying page URLs on top-level `about:blank` tabs.

```javascript
function openInAboutBlank(targetUrl, disguise = { title: 'Home - Google Classroom', favicon: 'https://ssl.gstatic.com/classroom/favicon.png' }) {
  try {
    const win = window.open('about:blank', '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      return false; // Intercepted by browser popup blocker; trigger 1-click splash fallback
    }

    const doc = win.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${disguise.title}</title>
        <link rel="icon" href="${disguise.favicon}">
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

    // Leave zero history in original tab by immediately replacing with educational decoy
    window.location.replace('https://classroom.google.com');
    return true;
  } catch (err) {
    console.warn('about:blank launch blocked:', err);
    return false;
  }
}
```

### Critical Implementation Rules
1. **Recursion Guard**: Always verify `window.self === window.top` before initiating auto-cloaking. If `window.self !== window.top`, the script is running inside the `about:blank` iframe and must not attempt another popup.
2. **User Gesture Fallback**: Modern browsers block `window.open` calls on page load if no user click has occurred. Provide a full-screen 1-click splash screen (`#auto-cloak-overlay`) so clicking anywhere triggers the popup inside a legitimate user gesture.
3. **Decoy Redirection**: Use `window.location.replace('https://classroom.google.com')` instead of `window.location.href = ...` so the game URL is completely removed from the tab session history.

---

## 3. Game Isolation & Anti-Frame-Busting Patches

Commercial web games (e.g., Polytrack, itch.io embeds) often implement anti-iframe checks to prevent theft or unauthorized embedding:

### 1. `ancestorOrigins` & Top-Window Bypasses
Games often check:
```javascript
if (window.top !== window.self) { /* throw "Iframe is not allowed" */ }
```
**Remediation**:
- In local game bundles, locate bundles or minified modules checking `location.ancestorOrigins` or `window.top !== window.self` and patch the boolean checks to return `false` or bypass redirect functions.
- Supply permissive sandbox attributes: `allow="fullscreen; autoplay; gamepad; cross-origin-isolated"`.

### 2. External Game Code Ripping
When remote CDNs are blocked by school firewalls:
- Extract single-file HTML or unpack `.zip` bundles to local hosting (`/uploads/games/<slug>/`).
- Rewrite asset paths from absolute CDN links to relative paths (`./assets/...`).
- Run code directly on the local origin to eliminate cross-origin restrictions.

---

## 4. In-Browser Proxy Workers (Ultraviolet / Bare Architecture)

For external dynamic web games that cannot be statically downloaded:
- **Service Worker Interceptor (`sw.js`)**: Registers on the client and intercepts all `fetch()` requests issued by the game.
- **URL Scrambling**: Rewrites outgoing URLs with an XOR or AES cipher (`/service/hvtrs8%2F%2F...`) so firewall deep packet inspection cannot read the target host.
- **Bare Server Bridge**: The backend fetches remote assets via server-to-server HTTP, removes blocking headers (`X-Frame-Options`, `Content-Security-Policy: frame-ancestors`), and streams responses back to the Service Worker.

---

## 5. Domain Generation & Edge Mirror Rotation

When the primary domain is blacklisted by school categorization databases:
1. **Decouple Frontend**: Maintain a purely static build of the portal frontend.
2. **Automate Deployments**: Use GitHub Actions to build and deploy mirrors across free edge platforms:
   - Cloudflare Pages (`*.pages.dev`)
   - Vercel (`*.vercel.app`)
   - Netlify (`*.netlify.app`)
   - Render (`*.onrender.com`)
3. **Disposable Subdomains**: Newly created subdomains take 24 to 72 hours for categorization crawlers to analyze, providing continuous access.

---

## 6. Offline PWA & Self-Contained Bundles

1. **Service Worker Cache API**: Cache all static bundle assets (`app.js`, `styles.css`, game bundles) on first visit.
2. **Zero-Network Mode**: Once stored, games can launch even if school Wi-Fi blocks internet access or drops connection.
3. **Data URI Fallback**: Single-file games can be stored as Base64 data strings in `localStorage` or `IndexedDB` and mounted via `data:text/html;base64,...` or `URL.createObjectURL(blob)`.
