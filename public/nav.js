// Gritnord shared sidebar nav — inject into any page
// Usage: <script src="/nav.js"></script> at bottom of <body>

(function () {
  const NAV_ITEMS = [
    { label: 'Overview',        icon: '◻',  href: '/dashboard.html',        group: null },
    { label: 'Generate',        icon: '✦',  href: '/dashboard.html#generate', group: null },
    { label: 'Content',         icon: '≡',  href: '/dashboard.html#content',  group: null },
    { label: 'Run Cycle',       icon: '↻',  href: '/dashboard.html#cycle',    group: null },
    { label: 'Channels',        icon: '◈',  href: '/dashboard.html#channels', group: null },
    { label: 'History',         icon: '◷',  href: '/dashboard.html#history',  group: null },
    { label: 'LinkedIn Queue',  icon: 'in', href: '/linkedin.html',           group: 'Publish' },
    { label: 'X Queue',         icon: '𝕏',  href: '/twitter.html',            group: null },
    { label: 'UC Acquisition',  icon: '🎯', href: '/uc-acquisition.html',     group: 'Growth' },
    { label: 'Product Roadmap', icon: '◈',  href: '/roadmap.html',            group: null },
    { label: 'Architecture V7', icon: '⬡',  href: '/architecture-v7.html',    group: null },
  ];

  const STYLES = `
    .gnav-trigger {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 1100;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: #0f0f0f;
      border: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      flex-direction: column;
      gap: 4px;
      padding: 9px;
    }
    .gnav-trigger:hover { background: #1a1a1a; border-color: rgba(255,255,255,0.22); }
    .gnav-trigger span {
      display: block;
      width: 100%;
      height: 1.5px;
      background: rgba(255,255,255,0.8);
      border-radius: 2px;
      transition: all 0.2s;
    }
    .gnav-trigger.open span:nth-child(1) { transform: translateY(5.5px) rotate(45deg); }
    .gnav-trigger.open span:nth-child(2) { opacity: 0; }
    .gnav-trigger.open span:nth-child(3) { transform: translateY(-5.5px) rotate(-45deg); }

    .gnav-overlay {
      position: fixed;
      inset: 0;
      z-index: 1050;
      background: rgba(0,0,0,0.55);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s;
    }
    .gnav-overlay.open { opacity: 1; pointer-events: all; }

    .gnav-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 1080;
      width: 240px;
      background: #0f0f0f;
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      transform: translateX(-100%);
      transition: transform 0.24s cubic-bezier(0.4,0,0.2,1);
    }
    .gnav-sidebar.open { transform: translateX(0); }

    .gnav-logo {
      padding: 22px 20px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .gnav-logo-name {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #fff;
      font-family: inherit;
    }
    .gnav-logo-sub {
      font-size: 10px;
      color: rgba(255,255,255,0.45);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-top: 2px;
      font-family: inherit;
    }

    .gnav-nav {
      flex: 1;
      overflow-y: auto;
      padding: 10px 8px;
    }
    .gnav-group-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.3);
      padding: 12px 12px 4px;
      font-family: inherit;
    }
    .gnav-item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 12px;
      color: rgba(255,255,255,0.55);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      border-radius: 9px;
      transition: all 0.14s;
      margin-bottom: 1px;
      font-family: inherit;
      cursor: pointer;
    }
    .gnav-item:hover {
      color: #fff;
      background: rgba(255,255,255,0.06);
    }
    .gnav-item.active {
      color: #fff;
      background: rgba(255,255,255,0.09);
    }
    .gnav-icon {
      font-size: 14px;
      width: 18px;
      text-align: center;
      flex-shrink: 0;
      opacity: 0.85;
    }

    .gnav-footer {
      padding: 14px 20px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      font-family: inherit;
      flex-shrink: 0;
    }
  `;

  function currentPage() {
    return window.location.pathname.replace(/\/$/, '') || '/dashboard.html';
  }

  function render() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'gnav-overlay';
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);

    // Sidebar
    const sidebar = document.createElement('nav');
    sidebar.className = 'gnav-sidebar';
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Main navigation');

    const logo = document.createElement('div');
    logo.className = 'gnav-logo';
    logo.innerHTML = `<div class="gnav-logo-name">Gritnord</div><div class="gnav-logo-sub">Content Engine</div>`;
    sidebar.appendChild(logo);

    const nav = document.createElement('div');
    nav.className = 'gnav-nav';

    let lastGroup = undefined;
    const path = currentPage();

    NAV_ITEMS.forEach(item => {
      if (item.group !== lastGroup) {
        if (item.group) {
          const gl = document.createElement('div');
          gl.className = 'gnav-group-label';
          gl.textContent = item.group;
          nav.appendChild(gl);
        }
        lastGroup = item.group;
      }

      const a = document.createElement('a');
      a.className = 'gnav-item';
      a.href = item.href;
      // Mark active if pathname matches (ignore hash)
      const itemPath = item.href.split('#')[0];
      if (path === itemPath || (path === '/' && itemPath === '/dashboard.html')) {
        a.classList.add('active');
      }
      a.innerHTML = `<span class="gnav-icon">${item.icon}</span>${item.label}`;
      nav.appendChild(a);
    });

    sidebar.appendChild(nav);

    const footer = document.createElement('div');
    footer.className = 'gnav-footer';
    footer.textContent = 'localhost:3000';
    sidebar.appendChild(footer);
    document.body.appendChild(sidebar);

    // Trigger button
    const trigger = document.createElement('button');
    trigger.className = 'gnav-trigger';
    trigger.setAttribute('aria-label', 'Toggle navigation');
    trigger.innerHTML = '<span></span><span></span><span></span>';
    trigger.addEventListener('click', toggle);
    document.body.appendChild(trigger);

    // Keyboard close
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function toggle() {
    const open = document.querySelector('.gnav-sidebar').classList.contains('open');
    open ? close() : open_();
  }
  function open_() {
    document.querySelector('.gnav-sidebar').classList.add('open');
    document.querySelector('.gnav-overlay').classList.add('open');
    document.querySelector('.gnav-trigger').classList.add('open');
  }
  function close() {
    document.querySelector('.gnav-sidebar').classList.remove('open');
    document.querySelector('.gnav-overlay').classList.remove('open');
    document.querySelector('.gnav-trigger').classList.remove('open');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
