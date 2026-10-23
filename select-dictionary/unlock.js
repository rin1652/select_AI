// Undoes common "no select / no copy / no right-click" tricks.
// Runs at document_start so our window capture listeners fire before the page's.
(() => {
  let enabled = true;

  const BLOCKED_EVENTS = ["selectstart", "copy", "cut", "contextmenu", "dragstart"];
  const COPY_KEYS = new Set(["a", "c", "x"]);

  const css = document.createElement("style");
  css.textContent = `
    *, *::before, *::after {
      -webkit-user-select: text !important;
      user-select: text !important;
    }
    ::selection { background: #3a7bd5 !important; color: #fff !important; }
  `;

  function applyCss() {
    if (!enabled) {
      css.remove();
    } else if (!css.isConnected) {
      (document.head || document.documentElement).appendChild(css);
    }
  }

  // Stop the page's own handlers from ever seeing these events,
  // so they can't cancel them. The browser's default action still runs.
  for (const type of BLOCKED_EVENTS) {
    window.addEventListener(
      type,
      (e) => {
        if (enabled) e.stopImmediatePropagation();
      },
      true
    );
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (enabled && (e.ctrlKey || e.metaKey) && COPY_KEYS.has(e.key.toLowerCase())) {
        e.stopImmediatePropagation();
      }
    },
    true
  );

  applyCss();
  // Pages often swap out <head> contents while loading; re-attach once it's ready.
  document.addEventListener("DOMContentLoaded", applyCss);

  chrome.storage.local.get({ unlockSelection: true }).then((s) => {
    enabled = s.unlockSelection;
    applyCss();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.unlockSelection) {
      enabled = changes.unlockSelection.newValue;
      applyCss();
    }
  });
})();
