// Shared defaults, loaded by both the background worker and the options page.
const DEFAULT_SYSTEM_PROMPT =
  "Bạn là trợ lý trả lời câu hỏi. Người dùng gửi một đoạn văn bản vừa bôi đen, " +
  "thường là một câu hỏi (có thể kèm các lựa chọn A/B/C/D). " +
  "Hãy đưa ra đáp án ngắn gọn nhất có thể: nếu là trắc nghiệm, chỉ ghi chữ cái và nội dung đáp án đúng; " +
  "nếu không, trả lời trong 1–2 câu. Không giải thích dài dòng. " +
  "Trả lời bằng ngôn ngữ của câu hỏi.";

const FALLBACK_MODELS = {
  shopaikey: ["gpt-6.1-sol"],
  openai: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  google: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
};

const DEFAULT_SETTINGS = {
  provider: "openai",
  apiKey: "",
  model: FALLBACK_MODELS.openai[0],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  unlockSelection: true,
  hiddenMode: false,
  hiddenOutline: false,
  fontSize: 7.5,
  blockSelectAll: true,
};

function loadSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}
