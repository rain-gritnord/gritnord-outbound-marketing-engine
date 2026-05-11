/**
 * Gritnord Content Engine — Embeddable Widget
 * 
 * Add to gritnord.com with:
 * <script src="https://your-engine.railway.app/embed/widget.js" data-theme="dark"><\/script>
 * 
 * Or embed the dashboard iframe:
 * <iframe src="https://your-engine.railway.app/dashboard.html" width="100%" height="800" frameborder="0"></iframe>
 * 
 * Or use the REST API directly from your frontend:
 * POST https://your-engine.railway.app/api/generate
 * { "channel": "linkedin", "topic": "your topic" }
 */

(function () {
  const ENGINE_URL = document.currentScript?.src?.replace("/embed/widget.js", "") || "http://localhost:3000";
  const THEME = document.currentScript?.dataset?.theme || "light";

  const style = document.createElement("style");
  style.textContent = `
    #gritnord-widget {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      border: 1px solid ${THEME === "dark" ? "rgba(255,255,255,0.1)" : "#e5e7eb"};
      border-radius: 12px;
      background: ${THEME === "dark" ? "#141618" : "#ffffff"};
      color: ${THEME === "dark" ? "#f0f0f0" : "#111"};
      overflow: hidden;
      max-width: 640px;
    }
    #gritnord-widget .gw-header {
      padding: 16px 20px;
      border-bottom: 1px solid ${THEME === "dark" ? "rgba(255,255,255,0.08)" : "#f0f0f0"};
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #gritnord-widget .gw-title { font-weight: 600; font-size: 14px; }
    #gritnord-widget .gw-body { padding: 20px; }
    #gritnord-widget select, #gritnord-widget textarea {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; margin-bottom: 10px;
      border-radius: 8px;
      border: 1px solid ${THEME === "dark" ? "rgba(255,255,255,0.12)" : "#d1d5db"};
      background: ${THEME === "dark" ? "#1c1f21" : "#f9fafb"};
      color: ${THEME === "dark" ? "#f0f0f0" : "#111"};
      font-size: 13px; font-family: inherit;
    }
    #gritnord-widget textarea { resize: vertical; min-height: 70px; }
    #gritnord-widget .gw-btn {
      width: 100%; padding: 10px; border: none; border-radius: 8px;
      background: #4af09e; color: #0a1a12;
      font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    #gritnord-widget .gw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #gritnord-widget .gw-output {
      margin-top: 14px;
      background: ${THEME === "dark" ? "#1c1f21" : "#f9fafb"};
      border-radius: 8px; padding: 14px;
      font-size: 13px; line-height: 1.7;
      white-space: pre-wrap; word-break: break-word;
      display: none;
    }
    #gritnord-widget .gw-copy {
      display: block; margin-top: 8px;
      font-size: 12px; color: #4af09e;
      background: none; border: none; cursor: pointer;
      font-family: inherit; text-align: left; padding: 0;
    }
    #gritnord-widget .gw-error {
      margin-top: 10px; padding: 10px 14px; border-radius: 8px;
      background: rgba(240,96,96,0.1); color: #f06060;
      font-size: 13px; display: none;
    }
  `;
  document.head.appendChild(style);

  async function fetchOptions() {
    try {
      const [opt, chs] = await Promise.all([
        fetch(ENGINE_URL + "/api/options").then(r => r.json()),
        fetch(ENGINE_URL + "/api/channels").then(r => r.json())
      ]);
      return { options: opt, channels: chs };
    } catch { return { options: { angles: [], tones: [] }, channels: [] }; }
  }

  async function generate(channel, topic, angle, tone) {
    const res = await fetch(ENGINE_URL + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, topic, angle, tone })
    });
    return res.json();
  }

  async function init() {
    const target = document.getElementById("gritnord-widget-mount") || (() => {
      const d = document.createElement("div");
      document.body.appendChild(d);
      return d;
    })();

    const { options, channels } = await fetchOptions();

    const widget = document.createElement("div");
    widget.id = "gritnord-widget";
    widget.innerHTML = `
      <div class="gw-header">
        <span class="gw-title">⚡ Gritnord Content Generator</span>
        <span style="font-size:11px;opacity:0.5">Autonomous · Self-learning</span>
      </div>
      <div class="gw-body">
        <select id="gw-channel">
          ${channels.map(c => `<option value="${c.id}">${c.label}</option>`).join("")}
        </select>
        <textarea id="gw-topic" placeholder="Enter topic or brief..."></textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <select id="gw-angle">${options.angles.map(a => `<option>${a}</option>`).join("")}</select>
          <select id="gw-tone">${options.tones.map(t => `<option>${t}</option>`).join("")}</select>
        </div>
        <button class="gw-btn" id="gw-btn">Generate</button>
        <div class="gw-error" id="gw-error">Generation failed — is the engine running?</div>
        <div class="gw-output" id="gw-output"></div>
        <button class="gw-copy" id="gw-copy" style="display:none" onclick="navigator.clipboard.writeText(document.getElementById('gw-output').textContent)">Copy to clipboard</button>
      </div>
    `;

    target.appendChild(widget);

    document.getElementById("gw-btn").addEventListener("click", async () => {
      const topic = document.getElementById("gw-topic").value.trim();
      if (!topic) return;
      const btn = document.getElementById("gw-btn");
      btn.disabled = true;
      btn.textContent = "Generating...";
      document.getElementById("gw-output").style.display = "none";
      document.getElementById("gw-copy").style.display = "none";
      document.getElementById("gw-error").style.display = "none";

      try {
        const item = await generate(
          document.getElementById("gw-channel").value,
          topic,
          document.getElementById("gw-angle").value,
          document.getElementById("gw-tone").value
        );
        document.getElementById("gw-output").textContent = item.content;
        document.getElementById("gw-output").style.display = "block";
        document.getElementById("gw-copy").style.display = "block";
      } catch {
        document.getElementById("gw-error").style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = "Generate";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
