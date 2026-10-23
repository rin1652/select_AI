const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

function loadLLM(fetch) {
  const context = vm.createContext({ fetch });
  for (const file of ["settings.js", "llm.js"]) {
    vm.runInContext(readFileSync(join(__dirname, "../select-dictionary", file), "utf8"), context);
  }
  return context;
}

const endpoints = {
  openai: "https://api.openai.com/v1",
  shopaikey: "https://api.shopaikey.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

for (const [provider, baseURL] of Object.entries(endpoints)) {
  for (const image of [undefined, "aW1hZ2U="]) {
    test(`${provider}: sends ${image ? "image" : "text"} and key to the selected provider`, async () => {
      let request;
      const llm = loadLLM(async (url, options) => {
        request = { url, ...options, body: JSON.parse(options.body) };
        return Response.json(provider === "google"
          ? { candidates: [{ content: { parts: [{ text: " 2 " }] } }] }
          : { choices: [{ message: { content: " 2 " } }] });
      });
      const model = vm.runInContext(`FALLBACK_MODELS.${provider}[0]`, llm);
      if (provider === "shopaikey") assert.equal(model, "gpt-6.1-sol");
      assert.equal(await llm.askLLM({ provider, apiKey: "test-key", model, systemPrompt: "Be brief" }, "1 + 1?", image), "2");
      assert.equal(request.method, "POST");
      if (provider === "google") {
        assert.equal(request.url, `${baseURL}/models/${model}:generateContent`);
        assert.equal(request.headers["x-goog-api-key"], "test-key");
        assert.deepEqual(request.body.system_instruction.parts, [{ text: "Be brief" }]);
        assert.deepEqual(request.body.contents[0].parts, image
          ? [{ text: "1 + 1?" }, { inline_data: { mime_type: "image/png", data: image } }]
          : [{ text: "1 + 1?" }]);
      } else {
        assert.equal(request.url, `${baseURL}/chat/completions`);
        assert.equal(request.headers.Authorization, "Bearer test-key");
        assert.equal(request.body.model, model);
        assert.deepEqual(request.body.messages, [
          { role: "system", content: "Be brief" },
          { role: "user", content: image
            ? [{ type: "text", text: "1 + 1?" }, { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } }]
            : "1 + 1?" },
        ]);
      }
    });
  }

  test(`${provider}: loads usable models from the selected provider`, async () => {
    const llm = loadLLM(async (url, options) => {
      assert.equal(url, `${baseURL}/models${provider === "google" ? "?pageSize=1000" : ""}`);
      assert.equal(provider === "google" ? options.headers["x-goog-api-key"] : options.headers.Authorization,
        provider === "google" ? "test-key" : "Bearer test-key");
      return Response.json(provider === "google" ? { models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ] } : { data: [{ id: "gpt-6.1-sol" }, { id: "gpt-4o" }, { id: "gpt-audio" }, { id: "text-embedding-3-small" }] });
    });
    assert.deepEqual(Array.from(await llm.listModels(provider, "test-key")),
      provider === "google" ? ["gemini-2.5-flash"] : ["gpt-4o", "gpt-6.1-sol"]);
  });
}

test("ShopAIKey: surfaces authentication and unavailable-model errors", async () => {
  const llm = loadLLM(async () => Response.json({ error: { message: "Model unavailable" } }, { status: 403 }));
  await assert.rejects(llm.askLLM({ provider: "shopaikey", apiKey: "invalid", model: "gpt-6.1-sol" }, "Hello"), /Model unavailable/);
  await assert.rejects(llm.listModels("shopaikey", "invalid"), /Model unavailable/);
});

test("ShopAIKey: surfaces non-JSON gateway errors", async () => {
  const llm = loadLLM(async () => new Response("Bad Gateway", { status: 502 }));
  await assert.rejects(llm.askLLM({ provider: "shopaikey", apiKey: "test", model: "gpt-6.1-sol" }, "Hello"), /HTTP 502/);
});
