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

async function lookup(text) {
  const settings = await loadSettings();
  if (!settings.apiKey) return lookupDictionary(text);

  try {
    const answer = await askLLM(settings, text);
    return { mode: "ai", model: settings.model, answer };
  } catch (e) {
    return { mode: "ai", model: settings.model, error: e.message };
  }
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

async function askAboutImage(image) {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    return { mode: "ai", model: "", error: "Cần nhập API key trong cài đặt để phân tích ảnh." };
  }
  try {
    const answer = await askLLM(settings, IMAGE_QUESTION, image);
    return { mode: "ai", model: settings.model, answer };
  } catch (e) {
    return { mode: "ai", model: settings.model, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "openOptions":
      chrome.runtime.openOptionsPage();
      return;
    case "lookup":
      lookup(msg.text).then(sendResponse);
      return true; // keep the channel open for the async response
    case "captureRegion":
      captureRegion(sender.tab.windowId, msg)
        .then((image) => sendResponse({ image }))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    case "askImage":
      askAboutImage(msg.image).then(sendResponse);
      return true;
  }
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
