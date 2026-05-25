// Gritnord shared sidebar nav — inject into any page
// Usage: <script src="/nav.js"></script> at bottom of <body>

(function () {
  const NAV_ITEMS = [
    { label: 'Overview',        icon: '◻',  href: '/dashboard.html',          group: null },
    { label: 'Generate',        icon: '✦',  href: '/dashboard.html#generate',  group: null },
    { label: 'Content',         icon: '≡',  href: '/dashboard.html#content',   group: null },
    { label: 'Run Cycle',       icon: '↻',  href: '/dashboard.html#cycle',     group: null },
    { label: 'Channels',        icon: '◈',  href: '/dashboard.html#channels',  group: null },
    { label: 'History',         icon: '◷',  href: '/dashboard.html#history',   group: null },
    { label: 'LinkedIn Queue',  icon: 'in', href: '/linkedin.html',            group: 'Publish' },
    { label: 'X Queue',         icon: '𝕏',  href: '/twitter.html',             group: null },
    { label: 'UC Acquisition',  icon: '🎯', href: '/uc-acquisition.html',      group: 'Growth' },
    { label: 'Content OS',      icon: '✦',  href: '/dashboard.html#content-os', group: null },
    { label: 'Product Flow',    icon: '→',  href: '/product-flow.html',         group: null },
    { label: 'Product Roadmap', icon: '◈',  href: '/roadmap.html',             group: null },
    { label: 'System Architecture', icon: '⬡',  href: '/system-architecture.html', group: null },
  ];

  // All selectors scoped under #gnav-root so nothing leaks, and !important guards
  // against page-level element rules (e.g. "nav { height:64px }" on arch page)
  const STYLES = `
    /* ── Trigger button ─────────────────────────────── */
    #gnav-trigger {
      position: fixed !important;
      top: 16px !important;
      left: 16px !important;
      z-index: 9100 !important;
      width: 36px !important;
      height: 36px !important;
      border-radius: 10px !important;
      background: #111 !important;
      border: 1px solid rgba(255,255,255,0.14) !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      cursor: pointer !important;
      padding: 10px !important;
      box-sizing: border-box !important;
      transition: background 0.15s, border-color 0.15s !important;
    }
    #gnav-trigger:hover { background: #1e1e1e !important; border-color: rgba(255,255,255,0.28) !important; }
    #gnav-trigger .gnav-bar {
      display: block !important;
      width: 16px !important;
      height: 1.5px !important;
      background: rgba(255,255,255,0.85) !important;
      border-radius: 2px !important;
      transition: all 0.2s !important;
      flex-shrink: 0 !important;
    }
    #gnav-trigger.gnav-open .gnav-bar:nth-child(1) { transform: translateY(6.5px) rotate(45deg) !important; }
    #gnav-trigger.gnav-open .gnav-bar:nth-child(2) { opacity: 0 !important; }
    #gnav-trigger.gnav-open .gnav-bar:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg) !important; }

    /* ── Overlay ─────────────────────────────────────── */
    #gnav-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 9050 !important;
      background: rgba(0,0,0,0.52) !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.22s !important;
    }
    #gnav-overlay.gnav-open { opacity: 1 !important; pointer-events: all !important; }

    /* ── Sidebar ─────────────────────────────────────── */
    #gnav-root {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 240px !important;
      height: 100vh !important;
      height: 100dvh !important;
      z-index: 9080 !important;
      background: #0f0f0f !important;
      border-right: 1px solid rgba(255,255,255,0.08) !important;
      display: flex !important;
      flex-direction: column !important;
      transform: translateX(-100%) !important;
      transition: transform 0.24s cubic-bezier(0.4,0,0.2,1) !important;
      font-family: -apple-system, 'Inter', sans-serif !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }
    #gnav-root.gnav-open { transform: translateX(0) !important; }

    /* ── Logo ────────────────────────────────────────── */
    #gnav-root .gnav-logo {
      padding: 22px 20px 18px !important;
      border-bottom: 1px solid rgba(255,255,255,0.08) !important;
      flex-shrink: 0 !important;
    }
    #gnav-root .gnav-logo-name {
      font-size: 14px !important;
      font-weight: 700 !important;
      letter-spacing: -0.01em !important;
      color: #ffffff !important;
      line-height: 1.2 !important;
    }
    #gnav-root .gnav-logo-sub {
      font-size: 10px !important;
      color: rgba(255,255,255,0.4) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.07em !important;
      margin-top: 3px !important;
      line-height: 1.2 !important;
    }

    /* ── Nav list ────────────────────────────────────── */
    #gnav-root .gnav-list {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 10px 8px !important;
      display: flex !important;
      flex-direction: column !important;
    }
    #gnav-root .gnav-group {
      font-size: 10px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      color: rgba(255,255,255,0.28) !important;
      padding: 14px 12px 5px !important;
      line-height: 1 !important;
    }
    #gnav-root .gnav-link {
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
      padding: 9px 12px !important;
      color: rgba(255,255,255,0.58) !important;
      text-decoration: none !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      border-radius: 9px !important;
      transition: background 0.13s, color 0.13s !important;
      margin-bottom: 1px !important;
      cursor: pointer !important;
      line-height: 1.3 !important;
    }
    #gnav-root .gnav-link:hover {
      color: #ffffff !important;
      background: rgba(255,255,255,0.07) !important;
    }
    #gnav-root .gnav-link.gnav-active {
      color: #ffffff !important;
      background: rgba(255,255,255,0.1) !important;
    }
    #gnav-root .gnav-icon {
      font-size: 13px !important;
      width: 18px !important;
      text-align: center !important;
      flex-shrink: 0 !important;
      opacity: 0.8 !important;
    }

    /* ── Footer ──────────────────────────────────────── */
    #gnav-root .gnav-footer {
      padding: 14px 20px !important;
      border-top: 1px solid rgba(255,255,255,0.08) !important;
      font-size: 11px !important;
      color: rgba(255,255,255,0.28) !important;
      flex-shrink: 0 !important;
      line-height: 1.2 !important;
    }
  `;

  function currentPage() {
    return window.location.pathname.replace(/\/$/, '') || '/dashboard.html';
  }

  function render() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'gnav-overlay';
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);

    // Sidebar — use DIV not NAV to avoid inheriting page nav{} styles
    const root = document.createElement('div');
    root.id = 'gnav-root';
    root.setAttribute('role', 'navigation');
    root.setAttribute('aria-label', 'Main navigation');

    // Logo
    const logo = document.createElement('div');
    logo.className = 'gnav-logo';
    logo.innerHTML = '<div class="gnav-logo-name">Gritnord</div><div class="gnav-logo-sub">Content Engine</div>';
    root.appendChild(logo);

    // Nav list
    const list = document.createElement('div');
    list.className = 'gnav-list';

    const path = currentPage();
    let lastGroup = undefined;

    NAV_ITEMS.forEach(item => {
      // Group divider
      if (item.group !== lastGroup) {
        if (item.group) {
          const gl = document.createElement('div');
          gl.className = 'gnav-group';
          gl.textContent = item.group;
          list.appendChild(gl);
        }
        lastGroup = item.group;
      }

      const a = document.createElement('a');
      a.className = 'gnav-link';
      a.href = item.href;
      const itemBase = item.href.split('#')[0];
      if (path === itemBase || (path === '/' && itemBase === '/dashboard.html')) {
        a.classList.add('gnav-active');
      }
      a.innerHTML = `<span class="gnav-icon">${item.icon}</span><span>${item.label}</span>`;
      list.appendChild(a);
    });

    root.appendChild(list);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'gnav-footer';
    footer.textContent = 'localhost:3000';
    root.appendChild(footer);
    document.body.appendChild(root);

    // Trigger button
    const trigger = document.createElement('button');
    trigger.id = 'gnav-trigger';
    trigger.setAttribute('aria-label', 'Toggle navigation');
    trigger.innerHTML = '<span class="gnav-bar"></span><span class="gnav-bar"></span><span class="gnav-bar"></span>';
    trigger.addEventListener('click', toggle);
    document.body.appendChild(trigger);

    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function toggle() {
    document.getElementById('gnav-root').classList.contains('gnav-open') ? close() : open_();
  }
  function open_() {
    document.getElementById('gnav-root').classList.add('gnav-open');
    document.getElementById('gnav-overlay').classList.add('gnav-open');
    document.getElementById('gnav-trigger').classList.add('gnav-open');
  }
  function close() {
    document.getElementById('gnav-root').classList.remove('gnav-open');
    document.getElementById('gnav-overlay').classList.remove('gnav-open');
    document.getElementById('gnav-trigger').classList.remove('gnav-open');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', render)
    : render();
})();
