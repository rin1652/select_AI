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
  $("blockSelectAll").checked = s.blockSelectAll;
  fillModels(FALLBACK_MODELS[s.provider], s.model);
});
