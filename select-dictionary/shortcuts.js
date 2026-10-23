// User-configurable keyboard shortcuts, shared by the content scripts and the
// settings page. Guarded so injecting it twice into one page is harmless.
globalThis.SDShortcuts ??= (() => {
  const IS_MAC = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform);

  const combo = (code, key, mods = {}) => ({
    code,
    key,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
    ...mods,
  });

  // Mac uses plain Control for the answer keys (Cmd keeps its usual meaning);
  // Windows needs Shift because Ctrl + A/C are select-all and copy there.
  function defaults() {
    return IS_MAC
      ? {
          selectCard: combo("Backquote", "`", { meta: true }),
          selectAnswer: combo("KeyA", "a", { ctrl: true }),
          copyAnswer: combo("KeyC", "c", { ctrl: true }),
        }
      : {
          selectCard: combo("Backquote", "`", { ctrl: true }),
          selectAnswer: combo("KeyA", "a", { ctrl: true, shift: true }),
          copyAnswer: combo("KeyC", "c", { ctrl: true, shift: true }),
        };
  }

  const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "CapsLock"]);

  // Turns a keydown into a stored shortcut, or null while only modifiers are held.
  function fromEvent(e) {
    if (MODIFIER_KEYS.has(e.key)) return null;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return combo(e.code, key, { ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey });
  }

  function matches(e, sc) {
    if (!sc) return false;
    // Prefer the physical key (layout-independent); fall back to the typed key.
    const sameKey = (e.code && e.code === sc.code) || e.key?.toLowerCase() === sc.key;
    return (
      sameKey &&
      e.ctrlKey === sc.ctrl &&
      e.metaKey === sc.meta &&
      e.shiftKey === sc.shift &&
      e.altKey === sc.alt
    );
  }

  function keyName(sc) {
    if (/^Key[A-Z]$/.test(sc.code)) return sc.code.slice(3);
    if (/^Digit\d$/.test(sc.code)) return sc.code.slice(5);
    if (sc.code === "Backquote") return "`";
    if (sc.key === " ") return "Space";
    return sc.key.length === 1 ? sc.key.toUpperCase() : sc.key;
  }

  function label(sc) {
    if (!sc) return "Chưa đặt";
    const parts = [];
    if (sc.ctrl) parts.push(IS_MAC ? "Control" : "Ctrl");
    if (sc.alt) parts.push(IS_MAC ? "Option" : "Alt");
    if (sc.shift) parts.push("Shift");
    if (sc.meta) parts.push(IS_MAC ? "Cmd" : "Win");
    parts.push(keyName(sc));
    return parts.join(" + ");
  }

  return { IS_MAC, defaults, fromEvent, matches, label };
})();
