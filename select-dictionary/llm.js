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

// Reads a server-sent-events body, calling onData with each parsed `data:` JSON.
async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!line.trim().startsWith("data:") || !data || data === "[DONE]") continue;
      try {
        onData(JSON.parse(data));
      } catch {
        // Ignore keep-alive or malformed lines.
      }
    }
  }
}

// Streams when `onDelta` or `signal` is given, so a closed popup can abort the
// request and stop the provider from generating (and billing) the rest.
function wantsStream(opts) {
  return Boolean(opts.onDelta || opts.signal);
}

const isEventStream = (res) => (res.headers.get("content-type") || "").includes("text/event-stream");

async function askOpenAI({ provider = "openai", apiKey, model, systemPrompt }, text, image, opts = {}) {
  const stream = wantsStream(opts);
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
      ...(stream && { stream: true }),
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(await readError(res));

  // Some OpenAI-compatible gateways ignore `stream`; handle a plain JSON reply too.
  if (!stream || !isEventStream(res)) {
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }
  let answer = "";
  await readSSE(res, (chunk) => {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      answer += delta;
      opts.onDelta?.(answer);
    }
  });
  return answer.trim();
}

async function askGemini({ apiKey, model, systemPrompt }, text, image, opts = {}) {
  const stream = wantsStream(opts);
  const parts = [{ text }];
  if (image) parts.push({ inline_data: { mime_type: "image/png", data: image } });
  const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`,
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
      signal: opts.signal,
    }
  );
  if (!res.ok) throw new Error(await readError(res));

  const textOf = (data) =>
    (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!stream || !isEventStream(res)) return textOf(await res.json()).trim();

  let answer = "";
  await readSSE(res, (chunk) => {
    const delta = textOf(chunk);
    if (delta) {
      answer += delta;
      opts.onDelta?.(answer);
    }
  });
  return answer.trim();
}

// `image` is optional base64 PNG; the chosen model must support images.
// `opts.signal` aborts the request; `opts.onDelta(textSoFar)` receives streamed text.
function askLLM(settings, text, image, opts) {
  return settings.provider === "google"
    ? askGemini(settings, text, image, opts)
    : askOpenAI(settings, text, image, opts);
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
