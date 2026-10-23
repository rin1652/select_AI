// Undoes common "no select / no copy / no right-click" tricks.
// Runs at document_start so our window capture listeners fire before the page's.
(() => {
  let enabled = true;
  // Our own shortcuts (content.js) must get through these key handlers.
  let shortcuts = SDShortcuts.defaults();
  let blockSelectAll = true;

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

  const TEXT_FIELDS =
    'input:not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable]';

  window.addEventListener(
    "keydown",
    (e) => {
      if (Object.values(shortcuts).some((sc) => SDShortcuts.matches(e, sc))) return;
      // Select-all/copy/cut use Cmd on Mac and Ctrl elsewhere.
      if (!(SDShortcuts.IS_MAC ? e.metaKey : e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl + A outside text fields does nothing, so a slip of the
      // finger can't highlight (and send) the whole page.
      if (blockSelectAll && key === "a" && !e.shiftKey && !e.target.closest?.(TEXT_FIELDS)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Shift/Alt combos aren't copy/cut/select-all; leave them for our other shortcuts.
      if (enabled && !e.shiftKey && !e.altKey && COPY_KEYS.has(key)) e.stopImmediatePropagation();
    },
    true
  );

  applyCss();
  // Pages often swap out <head> contents while loading; re-attach once it's ready.
  document.addEventListener("DOMContentLoaded", applyCss);

  chrome.storage.local.get({ unlockSelection: true, blockSelectAll: true, shortcuts: {} }).then((s) => {
    shortcuts = { ...SDShortcuts.defaults(), ...s.shortcuts };
    enabled = s.unlockSelection;
    blockSelectAll = s.blockSelectAll;
    applyCss();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.unlockSelection) {
      enabled = changes.unlockSelection.newValue;
      applyCss();
    }
    if (changes.blockSelectAll) blockSelectAll = changes.blockSelectAll.newValue;
    if (changes.shortcuts) shortcuts = { ...SDShortcuts.defaults(), ...changes.shortcuts.newValue };
  });
})();
