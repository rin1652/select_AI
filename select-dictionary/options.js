const $ = (id) => document.getElementById(id);

const KEY_HINTS = {
  shopaikey: "(key ShopAIKey · https://api.shopaikey.com/v1)",
  openai: "(lấy tại platform.openai.com/api-keys)",
  google: "(lấy tại aistudio.google.com/apikey)",
};

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = kind;
}

function fillModels(models, selected) {
  const list = models.includes(selected) || !selected ? models : [selected, ...models];
  $("model").innerHTML = "";
  for (const id of list) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = id;
    $("model").appendChild(opt);
  }
  if (selected && list.includes(selected)) $("model").value = selected;
}

function currentForm() {
  return {
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value,
    systemPrompt: $("systemPrompt").value.trim() || DEFAULT_SYSTEM_PROMPT,
    unlockSelection: $("unlockSelection").checked,
    hiddenMode: $("hiddenMode").checked,
    hiddenOutline: $("hiddenOutline").checked,
    fontSize: Number($("fontSize").value),
    blockSelectAll: $("blockSelectAll").checked,
  };
}

async function loadModelsFromAccount() {
  const { provider, apiKey, model } = currentForm();
  if (!apiKey) {
    setStatus("Dán API key trước rồi bấm Tải danh sách.", "err");
    return;
  }
  setStatus("Đang tải danh sách model…");
  try {
    const models = await listModels(provider, apiKey);
    if (!models.length) throw new Error("Không có model nào khả dụng.");
    fillModels(models, models.includes(model) ? model : models[0]);
    setStatus(`Đã tải ${models.length} model.`, "ok");
  } catch (e) {
    setStatus(`Không tải được model: ${e.message}`, "err");
  }
}

$("provider").addEventListener("change", () => {
  const provider = $("provider").value;
  $("keyHint").textContent = KEY_HINTS[provider];
  // Each provider keeps its own key.
  chrome.storage.local.get({ keys: {} }).then(({ keys }) => {
    $("apiKey").value = keys[provider] || "";
    fillModels(FALLBACK_MODELS[provider], FALLBACK_MODELS[provider][0]);
    if ($("apiKey").value) loadModelsFromAccount();
    else setStatus("");
  });
});

$("loadModels").addEventListener("click", loadModelsFromAccount);

$("save").addEventListener("click", async () => {
  const form = currentForm();
  const { keys } = await chrome.storage.local.get({ keys: {} });
  keys[form.provider] = form.apiKey;
  await chrome.storage.local.set({ ...form, keys });
  setStatus("Đã lưu. Bôi đen một câu hỏi trên trang để thử.", "ok");
});

function showFontSize() {
  $("fontSizeValue").textContent = `${$("fontSize").value}px`;
}

$("fontSize").addEventListener("input", async () => {
  showFontSize();
  await chrome.storage.local.set({ fontSize: Number($("fontSize").value) });
});

// Toggles take effect right away, without pressing Save.
for (const id of ["unlockSelection", "blockSelectAll", "hiddenMode", "hiddenOutline"]) {
  $(id).addEventListener("change", async () => {
    await chrome.storage.local.set({ [id]: $(id).checked });
    setStatus("Đã lưu. Tải lại (F5) các tab đang mở để áp dụng.", "ok");
  });
}

$("test").addEventListener("click", async () => {
  const form = currentForm();
  if (!form.apiKey) {
    setStatus("Chưa có API key.", "err");
    return;
  }
  setStatus("Đang thử…");
  try {
    const answer = await askLLM(form, "1 + 1 = ?");
    setStatus(`Kết nối OK. Trả lời thử: ${answer}`, "ok");
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, "err");
  }
});

$("editShortcut").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

chrome.commands.getAll().then((commands) => {
  const capture = commands.find((c) => c.name === "capture-question");
  $("shortcut").textContent = capture?.shortcut || "Chưa đặt – bấm Đổi phím tắt";
});

// ---- Shortcuts ----

let shortcuts = SDShortcuts.defaults();

const CLICK_MODIFIER_LABELS = SDShortcuts.IS_MAC
  ? { alt: "Option", ctrl: "Control", shift: "Shift", meta: "Cmd", none: "Tắt" }
  : { alt: "Alt", ctrl: "Ctrl", shift: "Shift", meta: "Win", none: "Tắt" };

for (const [value, text] of Object.entries(CLICK_MODIFIER_LABELS)) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  $("cardClickModifier").appendChild(opt);
}

function showShortcuts() {
  for (const btn of document.querySelectorAll("button.record")) {
    btn.textContent = SDShortcuts.label(shortcuts[btn.dataset.name]);
    btn.classList.remove("listening");
  }
}

let recording = null; // the button waiting for a key combo

function stopRecording() {
  recording = null;
  window.removeEventListener("keydown", onRecordKey, true);
  showShortcuts();
}

async function onRecordKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") {
    stopRecording();
    return;
  }
  const sc = SDShortcuts.fromEvent(e);
  if (!sc) return; // only modifiers held so far
  if (!sc.ctrl && !sc.meta && !sc.alt) {
    setStatus("Phím tắt cần có Ctrl, Cmd hoặc Alt/Option để không lẫn với gõ chữ.", "err");
    return;
  }
  const name = recording.dataset.name;
  const clash = Object.entries(shortcuts).find(
    ([other, value]) => other !== name && SDShortcuts.label(value) === SDShortcuts.label(sc)
  );
  if (clash) {
    setStatus(`${SDShortcuts.label(sc)} đang dùng cho chức năng khác.`, "err");
    return;
  }
  shortcuts = { ...shortcuts, [name]: sc };
  await chrome.storage.local.set({ shortcuts });
  stopRecording();
  setStatus(`Đã đặt ${SDShortcuts.label(sc)}.`, "ok");
}

for (const btn of document.querySelectorAll("button.record")) {
  btn.addEventListener("click", () => {
    if (recording) stopRecording();
    recording = btn;
    btn.textContent = "Nhấn tổ hợp phím…";
    btn.classList.add("listening");
    window.addEventListener("keydown", onRecordKey, true);
  });
}

$("cardClickModifier").addEventListener("change", async () => {
  await chrome.storage.local.set({ cardClickModifier: $("cardClickModifier").value });
  setStatus("Đã lưu.", "ok");
});

$("resetShortcuts").addEventListener("click", async () => {
  shortcuts = SDShortcuts.defaults();
  $("cardClickModifier").value = "alt";
  await chrome.storage.local.set({ shortcuts, cardClickModifier: "alt" });
  showShortcuts();
  setStatus("Đã khôi phục phím tắt mặc định.", "ok");
});

chrome.storage.local.get({ shortcuts: {}, cardClickModifier: "alt" }).then((s) => {
  shortcuts = { ...SDShortcuts.defaults(), ...s.shortcuts };
  $("cardClickModifier").value = s.cardClickModifier;
  showShortcuts();
});

$("resetPrompt").addEventListener("click", () => {
  $("systemPrompt").value = DEFAULT_SYSTEM_PROMPT;
});

loadSettings().then((s) => {
  $("provider").value = s.provider;
  $("keyHint").textContent = KEY_HINTS[s.provider];
  $("apiKey").value = s.apiKey;
  $("systemPrompt").value = s.systemPrompt;
  $("unlockSelection").checked = s.unlockSelection;
  $("hiddenMode").checked = s.hiddenMode;
  $("hiddenOutline").checked = s.hiddenOutline;
  $("fontSize").value = s.fontSize;
  showFontSize();
  $("blockSelectAll").checked = s.blockSelectAll;
  fillModels(FALLBACK_MODELS[s.provider], s.model);
});
