// OpenAI / ShopAIKey / Gemini calls, shared by the background worker and the options page.
const OPENAI_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  shopaikey: "https://api.shopaikey.com/v1",
};

async function readError(res) {
  try {
    const data = await res.json();
    return data.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function askOpenAI({ provider = "openai", apiKey, model, systemPrompt }, text, image) {
  const content = image
    ? [
        { type: "text", text },
        { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } },
      ]
    : text;
  const res = await fetch(`${OPENAI_BASE_URLS[provider]}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function askGemini({ apiKey, model, systemPrompt }, text, image) {
  const parts = [{ text }];
  if (image) parts.push({ inline_data: { mime_type: "image/png", data: image } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
      }),
    }
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const answerParts = data.candidates?.[0]?.content?.parts || [];
  return answerParts.map((p) => p.text || "").join("").trim();
}

// `image` is optional base64 PNG; the chosen model must support images.
function askLLM(settings, text, image) {
  return settings.provider === "google"
    ? askGemini(settings, text, image)
    : askOpenAI(settings, text, image);
}

// Returns the chat-capable models the key has access to.
async function listModels(provider, apiKey) {
  if (provider === "google") {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      { headers: { "x-goog-api-key": apiKey } }
    );
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((name) => name.startsWith("gemini"))
      .sort();
  }

  const res = await fetch(`${OPENAI_BASE_URLS[provider]}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const skip = /audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct/;
  return (data.data || [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !skip.test(id))
    .sort();
}
