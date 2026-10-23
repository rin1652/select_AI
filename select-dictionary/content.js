// Shows a dictionary popup next to any text the user highlights.
(() => {
  // The capture shortcut may inject this script again into an already-open tab.
  if (window.__selectDictionaryLoaded) return;
  window.__selectDictionaryLoaded = true;

  const MAX_LENGTH = 4000;

  const STYLE = `
    :host { all: initial; }
    .card {
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      max-width: calc(100vw - 24px);
      box-sizing: border-box;
      padding: 14px 16px 12px;
      background: #fffde0;
      color: #1a1a1a;
      border: 1px solid #e6e0a8;
      border-radius: 6px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      text-align: left;
    }
    .head { display: flex; align-items: center; gap: 8px; }
    .word { font-size: 20px; font-weight: 700; word-break: break-word; }
    .speak {
      border: 0; background: none; cursor: pointer; padding: 2px;
      display: inline-flex; color: #222;
    }
    .speak:hover { color: #0b63ce; }
    .phonetic { color: #666; font-size: 14px; margin-top: 2px; }
    .meaning { margin-top: 8px; }
    .pos { font-style: italic; color: #7a6a00; font-size: 13px; }
    .example { color: #555; font-style: italic; font-size: 13px; margin-top: 2px; }
    .vi {
      margin-top: 10px; padding-top: 8px;
      border-top: 1px dashed #e0d98f; color: #0b4f9c;
    }
    .vi-label { font-size: 12px; color: #888; margin-right: 4px; }
    .muted { color: #888; font-size: 14px; margin-top: 6px; }

    /* Invisible mode: nothing shows until the user selects text inside the popup. */
    .card.hidden-mode,
    .card.hidden-mode * {
      color: transparent !important;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    .card.hidden-mode ::selection {
      color: #fff;
      background: #3a7bd5;
    }
    .answer { white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow: auto; }
    .error { color: #c0362c; font-size: 14px; }
    .settings {
      border: 0; background: none; cursor: pointer; padding: 0;
      color: #0b63ce; font: inherit; font-size: 13px; margin-top: 8px;
    }
  `;

  const SPEAKER_SVG = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3z"/>
      <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z"/>
      <path d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/>
    </svg>`;

  let host = null;
  let requestId = 0;
  let hiddenMode = false;

  chrome.storage.local.get({ hiddenMode: false }).then((s) => {
    hiddenMode = s.hiddenMode;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.hiddenMode) hiddenMode = changes.hiddenMode.newValue;
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function closePopup() {
    requestId++;
    if (host) {
      host.remove();
      host = null;
    }
  }

  function speak(text, audioUrl) {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakWithVoice(text));
    } else {
      speakWithVoice(text);
    }
  }

  function speakWithVoice(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // `message` is sent to the background worker and its reply fills the popup;
  // pass `result` instead to show something without asking.
  function showPopup(rect, message, result) {
    closePopup();
    const text = message?.text || "";

    host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${STYLE}</style><div class="card"></div>`;
    const card = shadow.querySelector(".card");
    card.classList.toggle("hidden-mode", hiddenMode);
    document.documentElement.appendChild(host);

    render(card, text, result || null);
    position(card, rect);
    if (result) return;

    const id = ++requestId;
    chrome.runtime.sendMessage(message, (res) => {
      if (id !== requestId || !host) return;
      if (chrome.runtime.lastError) res = null;
      render(card, text, res || { definition: null, translation: "" });
      position(card, rect);
    });
  }

  function render(card, text, res) {
    if (!res) {
      card.innerHTML = `<div class="muted">Đang tra…</div>`;
      return;
    }
    if (res.mode === "ai") {
      renderAnswer(card, res);
      return;
    }

    const def = res?.definition;
    const title = def?.word || text;
    let body;

    if (!res) {
      body = `<div class="muted">Đang tra…</div>`;
    } else {
      body = "";
      if (def?.phonetic) {
        body += `<div class="phonetic">${escapeHtml(def.phonetic)}</div>`;
      }
      for (const m of def?.meanings || []) {
        body += `
          <div class="meaning">
            <span class="pos">${escapeHtml(m.partOfSpeech)}</span>
            <div>${escapeHtml(m.definition)}</div>
            ${m.example ? `<div class="example">“${escapeHtml(m.example)}”</div>` : ""}
          </div>`;
      }
      if (res.translation) {
        body += `<div class="vi"><span class="vi-label">VI</span>${escapeHtml(res.translation)}</div>`;
      }
      if (!def && !res.translation) {
        body += `<div class="muted">Không tìm thấy nghĩa.</div>`;
      }
    }

    card.innerHTML = `
      <div class="head">
        <span class="word">${escapeHtml(title.length > 60 ? title.slice(0, 60) + "…" : title)}</span>
        <button class="speak" title="Phát âm">${SPEAKER_SVG}</button>
      </div>
      ${body}`;

    card.querySelector(".speak").addEventListener("click", () =>
      speak(title, def?.audio)
    );
  }

  function renderAnswer(card, res) {
    const body = res.error
      ? `<div class="error">Lỗi: ${escapeHtml(res.error)}</div>
         <button class="settings">Mở cài đặt</button>`
      : `<div class="answer">${escapeHtml(res.answer || "(không có câu trả lời)")}</div>`;

    card.innerHTML = body;
    card.querySelector(".settings")?.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type: "openOptions" })
    );
  }

  function position(card, rect) {
    const margin = 8;
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    left = Math.max(margin, Math.min(left, vw - cardW - margin));

    // Below the selection, or above it if there's no room.
    let top = rect.bottom + margin;
    if (top + cardH > vh && rect.top - cardH - margin > 0) {
      top = rect.top - cardH - margin;
    }

    top = Math.min(top, vh - cardH - margin);

    card.style.left = `${left}px`;
    card.style.top = `${Math.max(margin, top)}px`;
  }

  function handleSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim().replace(/\s+/g, " ") : "";
    if (!text || text.length > MAX_LENGTH || sel.rangeCount === 0) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    showPopup(rect, { type: "lookup", text });
  }

  // Capture phase on window so pages that stop event propagation can't hide it.
  window.addEventListener(
    "mouseup",
    (e) => {
      if (e.button !== 0) return;
      if (host && e.composedPath().includes(host)) return;
      // Let the browser finish updating the selection first.
      setTimeout(handleSelection, 10);
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Escape") {
        cancelCapture();
        closePopup();
      }
      else if (e.shiftKey) setTimeout(handleSelection, 10);
    },
    true
  );

  window.addEventListener(
    "mousedown",
    (e) => {
      if (host && !e.composedPath().includes(host)) closePopup();
    },
    true
  );

  window.addEventListener("scroll", () => host && closePopup(), true);

  // ---- Shortcut capture: drag a box around the question, AI reads the screenshot ----

  const OVERLAY_STYLE = `
    :host { all: initial; }
    .layer {
      position: fixed; inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      background: rgba(0, 0, 0, 0.25);
    }
    .tip {
      position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
      padding: 8px 14px;
      background: #1a1a1a; color: #fff;
      border-radius: 999px;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      pointer-events: none;
      white-space: nowrap;
    }
    .box {
      position: fixed; display: none;
      border: 2px dashed #3a7bd5;
      background: rgba(58, 123, 213, 0.15);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
      pointer-events: none;
    }
  `;

  let overlay = null;

  function cancelCapture() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function startCapture() {
    if (overlay) return;
    closePopup();
    window.getSelection()?.removeAllRanges();

    overlay = document.createElement("div");
    const shadow = overlay.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${OVERLAY_STYLE}</style>
      <div class="layer">
        <div class="tip">Kéo chuột quanh câu hỏi · Click để chụp cả màn hình · Esc để huỷ</div>
        <div class="box"></div>
      </div>`;
    document.documentElement.appendChild(overlay);

    const layer = shadow.querySelector(".layer");
    const box = shadow.querySelector(".box");
    let start = null;

    const boxRect = (e) => ({
      left: Math.min(start.x, e.clientX),
      top: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x),
      height: Math.abs(e.clientY - start.y),
    });

    layer.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      layer.setPointerCapture(e.pointerId);
    });

    layer.addEventListener("pointermove", (e) => {
      if (!start) return;
      const r = boxRect(e);
      Object.assign(box.style, {
        display: "block",
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      layer.style.background = "transparent";
    });

    layer.addEventListener("pointerup", (e) => {
      if (!start) return;
      let r = boxRect(e);
      // A plain click means "the whole visible page".
      if (r.width < 10 || r.height < 10) {
        r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      }
      cancelCapture();
      // Wait for the overlay to disappear from the screen before the screenshot.
      requestAnimationFrame(() => requestAnimationFrame(() => captureAndAsk(r)));
    });
  }

  function captureAndAsk(r) {
    const rect = { ...r, right: r.left + r.width, bottom: r.top + r.height };
    chrome.runtime.sendMessage(
      { type: "captureRegion", rect, viewportWidth: window.innerWidth },
      (res) => {
        if (chrome.runtime.lastError || !res?.image) {
          const error = res?.error || chrome.runtime.lastError?.message || "Không chụp được màn hình.";
          showPopup(rect, null, { mode: "ai", model: "", error });
          return;
        }
        showPopup(rect, { type: "askImage", image: res.image });
      }
    );
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "startCapture") startCapture();
  });
})();
