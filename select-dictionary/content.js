// Shows a dictionary popup next to any text the user highlights.
(() => {
  // The capture shortcut may inject this script again into an already-open tab.
  if (window.__selectDictionaryLoaded) return;
  window.__selectDictionaryLoaded = true;

  const MAX_LENGTH = 4000;
  const IS_MAC = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform);

  // Answer shortcuts: Control + key on Mac (Cmd keeps its usual meaning),
  // Ctrl + Shift + key on Windows (plain Ctrl + A/C are select-all/copy there).
  function isAnswerShortcut(e, letter) {
    const isLetter = e.code === `Key${letter.toUpperCase()}` || e.key?.toLowerCase() === letter;
    if (!isLetter || !e.ctrlKey || e.altKey || e.metaKey) return false;
    if (!IS_MAC) return e.shiftKey;
    // Control + A/E… move the caret in Mac text fields; leave those alone.
    return e.shiftKey || !e.target.closest?.("input, textarea, [contenteditable]");
  }

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
      font-weight: 300;
      -webkit-font-smoothing: antialiased;
      text-align: left;
    }
    .head { display: flex; align-items: center; gap: 8px; }
    .word { font-size: 1.333em; font-weight: 400; word-break: break-word; }
    .speak {
      border: 0; background: none; cursor: pointer; padding: 2px;
      display: inline-flex; color: #222;
    }
    .speak:hover { color: #0b63ce; }
    .phonetic { color: #666; font-size: 0.933em; margin-top: 2px; }
    .meaning { margin-top: 8px; }
    .pos { font-style: italic; color: #7a6a00; font-size: 0.867em; }
    .example { color: #555; font-style: italic; font-size: 0.867em; margin-top: 2px; }
    .vi {
      margin-top: 10px; padding-top: 8px;
      border-top: 1px dashed #e0d98f; color: #0b4f9c;
    }
    .vi-label { font-size: 0.8em; color: #888; margin-right: 4px; }
    .muted { color: #888; font-size: 0.933em; margin-top: 6px; }

    /* Invisible mode: nothing shows until the user selects text inside the popup. */
    .card.hidden-mode,
    .card.hidden-mode * {
      color: transparent !important;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    /* Optional thin outline so you can see where to select. */
    .card.hidden-mode.outline {
      /* Thinnest line the screen can draw: 1 device pixel on Retina, 1px elsewhere. */
      border: 0.5px solid #000 !important;
    }
    .card.hidden-mode ::selection {
      color: #fff;
      background: #3a7bd5;
    }
    .answer { white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow: auto; }
    .error { color: #c0362c; font-size: 0.933em; }
    .settings {
      border: 0; background: none; cursor: pointer; padding: 0;
      color: #0b63ce; font: inherit; font-size: 0.867em; margin-top: 8px;
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
  let port = null;
  // Wait this long after a selection before asking, so a quick mis-selection costs nothing.
  const SEND_DELAY_MS = 500;
  let hiddenMode = false;
  let lastAnswer = "";
  let hiddenOutline = false;
  let fontSize = 7.5;

  chrome.storage.local.get({ hiddenMode: false, hiddenOutline: false, fontSize: 7.5 }).then((s) => {
    hiddenMode = s.hiddenMode;
    hiddenOutline = s.hiddenOutline;
    fontSize = s.fontSize;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.hiddenMode) hiddenMode = changes.hiddenMode.newValue;
    if (changes.hiddenOutline) hiddenOutline = changes.hiddenOutline.newValue;
    if (changes.fontSize) fontSize = changes.fontSize.newValue;
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function closePopup() {
    requestId++;
    // Disconnecting aborts the AI request, so an abandoned popup stops costing tokens.
    port?.disconnect();
    port = null;
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
    card.classList.toggle("outline", hiddenOutline);
    // Every other text size in the popup is relative (em) to this one.
    card.style.fontSize = `${fontSize}px`;
    document.documentElement.appendChild(host);

    render(card, text, result || null);
    position(card, rect);
    if (result) return;

    const id = ++requestId;
    const delay = message.type === "lookup" ? SEND_DELAY_MS : 0;
    setTimeout(() => {
      if (id !== requestId || !host) return;
      port = chrome.runtime.connect({ name: "ask" });
      port.onMessage.addListener((msg) => {
        if (id !== requestId || !host) return;
        if (msg.type === "delta") {
          const answer = card.querySelector(".answer");
          if (answer) {
            answer.textContent = msg.text;
          } else {
            renderAnswer(card, { mode: "ai", answer: msg.text });
            position(card, rect);
          }
          return;
        }
        render(card, text, msg.result);
        position(card, rect);
        port.disconnect();
        port = null;
      });
      port.postMessage(message);
    }, delay);
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
    if (res.answer && !res.error) lastAnswer = res.answer;
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
    // Text selected inside our own popup is for reading, not a new question.
    if (host && (sel.anchorNode === host || host.shadowRoot.contains(sel.anchorNode))) return;

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
      else if (e.shiftKey && !e.ctrlKey && !e.metaKey) setTimeout(handleSelection, 10);
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

  // ---- Select the whole card (question + options) at once ----

  const CARD_MAX_TEXT = 1500;

  function looksLikeCard(el) {
    const style = getComputedStyle(el);
    if (style.display.startsWith("inline")) return false;
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some(
      (side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none"
    );
    const hasShadow = style.boxShadow !== "none";
    const hasBackground =
      style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.backgroundColor !== getComputedStyle(el.parentElement || el).backgroundColor;
    return hasBorder || hasShadow || hasBackground;
  }

  // Outermost card-like ancestor that still holds a reasonable amount of text,
  // so a click on an option picks the whole question card around it.
  function findCard(target) {
    let best = null;
    let fallback = null;
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const text = el.innerText?.trim() || "";
      if (text.length > CARD_MAX_TEXT || el.offsetHeight > window.innerHeight * 0.9) break;
      if (!fallback && text && !getComputedStyle(el).display.startsWith("inline")) fallback = el;
      if (text && looksLikeCard(el)) best = el;
    }
    return best || fallback;
  }

  const TEXT_FIELDS =
    'input:not([type="radio"]):not([type="checkbox"]), textarea, select, [contenteditable]';

  function selectCard(card) {
    const range = document.createRange();
    range.selectNodeContents(card);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Alt/Option + click.
  const wantsCardClick = (e) =>
    e.altKey && !(host && e.composedPath().includes(host));

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!wantsCardClick(e) || e.button !== 0 || overlay) return;
      const card = findCard(e.target);
      if (!card) return;

      // Keep the page from reacting (ticking a radio, following a link…).
      e.preventDefault();
      e.stopImmediatePropagation();
      selectCard(card);
      // The mouseup listener above opens the popup for this selection.
    },
    true
  );

  window.addEventListener(
    "click",
    (e) => {
      if (wantsCardClick(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  // Control + C (Mac) / Ctrl + Shift + C (Windows): copy the latest AI answer.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked (no focus, permissions policy): fall back.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.documentElement.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isAnswerShortcut(e, "c")) return;
      if (!lastAnswer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      copyText(lastAnswer);
    },
    true
  );

  // Control + A (Mac) / Ctrl + Shift + A (Windows): highlight the answer in the popup.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!isAnswerShortcut(e, "a")) return;
      const answer = host?.shadowRoot.querySelector(".answer, .error");
      if (!answer) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const range = document.createRange();
      range.selectNodeContents(answer);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    },
    true
  );

  // Cmd/Ctrl + `: select the card under the mouse pointer, no click needed.
  let pointer = null;

  window.addEventListener(
    "mousemove",
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    "keydown",
    (e) => {
      const isBackquote = e.code === "Backquote" || e.key === "`";
      if (!isBackquote || !(e.metaKey || e.ctrlKey) || e.repeat) return;
      if (!pointer || overlay) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const target = document.elementFromPoint(pointer.x, pointer.y);
      if (!target || target === host) return;
      const card = findCard(target);
      if (!card) return;

      selectCard(card);
      handleSelection();
    },
    true
  );

  // ---- Shortcut capture: drag a box around the question, AI reads the screenshot ----

  // Invisible layer: the only sign of capture mode is the crosshair cursor.
  const OVERLAY_STYLE = `
    :host { all: initial; }
    .layer {
      position: fixed; inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      background: transparent;
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
      <div class="layer"></div>`;
    document.documentElement.appendChild(overlay);

    const layer = shadow.querySelector(".layer");
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
