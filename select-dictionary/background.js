// Fetches run here so page CSP / CORS can't block them.
importScripts("settings.js", "llm.js");

async function lookupDefinition(word) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const entry = data[0];
  if (!entry) return null;

  const phonetic =
    entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || "";
  const audio = entry.phonetics?.find((p) => p.audio)?.audio || "";
  const meanings = (entry.meanings || []).slice(0, 3).map((m) => ({
    partOfSpeech: m.partOfSpeech,
    definition: m.definitions?.[0]?.definition || "",
    example: m.definitions?.[0]?.example || "",
  }));

  return { word: entry.word, phonetic, audio, meanings };
}

async function translateToVietnamese(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) return "";
  const data = await res.json();
  return (data[0] || []).map((part) => part[0]).join("");
}

async function lookupDictionary(text) {
  const isSingleWord = /^[A-Za-z][A-Za-z'-]*$/.test(text);
  const [definition, translation] = await Promise.all([
    isSingleWord ? lookupDefinition(text).catch(() => null) : null,
    translateToVietnamese(text).catch(() => ""),
  ]);
  return { mode: "dictionary", definition, translation };
}

// `opts` = { signal, onDelta } from askLLM; an aborted request returns null.
async function askAI(settings, text, image, opts) {
  try {
    const answer = await askLLM(settings, text, image, opts);
    return { mode: "ai", model: settings.model, answer };
  } catch (e) {
    if (opts.signal?.aborted) return null;
    return { mode: "ai", model: settings.model, error: e.message };
  }
}

async function lookup(text, opts) {
  const settings = await loadSettings();
  if (!settings.apiKey) return lookupDictionary(text);
  return askAI(settings, text, undefined, opts);
}

const IMAGE_QUESTION = "Trả lời câu hỏi trong ảnh.";

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Screenshots the visible tab and crops it to the rect the user dragged (CSS px).
async function captureRegion(windowId, { rect, viewportWidth }) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = bitmap.width / viewportWidth;

  const sx = Math.max(0, Math.round(rect.left * scale));
  const sy = Math.max(0, Math.round(rect.top * scale));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.width * scale));
  const sh = Math.min(bitmap.height - sy, Math.round(rect.height * scale));

  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return blobToBase64(await canvas.convertToBlob({ type: "image/png" }));
}

async function askAboutImage(image, opts) {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    return { mode: "ai", model: "", error: "Cần nhập API key trong cài đặt để phân tích ảnh." };
  }
  return askAI(settings, IMAGE_QUESTION, image, opts);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "openOptions":
      chrome.runtime.openOptionsPage();
      return;
    case "captureRegion":
      captureRegion(sender.tab.windowId, msg)
        .then((image) => sendResponse({ image }))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // keep the channel open for the async response
  }
});

// Each popup opens an "ask" port. Closing the popup disconnects it, which
// aborts the request so the provider stops generating (and billing) tokens.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ask") return;
  const controller = new AbortController();
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
    controller.abort();
  });
  const post = (msg) => open && port.postMessage(msg);

  port.onMessage.addListener(async (msg) => {
    const opts = { signal: controller.signal, onDelta: (text) => post({ type: "delta", text }) };
    const result =
      msg.type === "askImage" ? await askAboutImage(msg.image, opts) : await lookup(msg.text, opts);
    if (result) post({ type: "done", result });
  });
});

// The shortcut works even when the page blocks selection or key events,
// because the browser handles it before the page sees it.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "capture-question" || !tab?.id) return;
  const msg = { type: "startCapture" };
  try {
    await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
  } catch {
    // Tab was opened before the extension was installed/reloaded: inject now.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
