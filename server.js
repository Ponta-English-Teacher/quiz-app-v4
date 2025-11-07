// server.js — static hosting + Azure TTS proxy + GPT translation using .env.local

// Load env vars from .env.local (keeps keys out of code)
require("dotenv").config({ path: ".env.local" });

const express = require("express");
const path = require("path");

// Node 18+ has global fetch; no need for node-fetch
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- Serve /public
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ---- Azure TTS envs
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY || "";
const AZURE_TTS_REGION = process.env.AZURE_TTS_REGION || ""; // e.g., "eastus"
const AZURE_TTS_ENDPOINT = process.env.AZURE_TTS_ENDPOINT || ""; // e.g., "https://eastus.tts.speech.microsoft.com"
const DEF_VOICE_EN = process.env.AZURE_TTS_DEFAULT_VOICE_EN || "en-GB-LibbyNeural";
const DEF_VOICE_JA = process.env.AZURE_TTS_DEFAULT_VOICE_JA || "ja-JP-NanamiNeural";

function getSynthesisUrl() {
  if (AZURE_TTS_ENDPOINT) {
    return AZURE_TTS_ENDPOINT.replace(/\/+$/, "") + "/cognitiveservices/v1";
  }
  if (!AZURE_TTS_REGION) throw new Error("AZURE_TTS_REGION not set");
  return `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
}
function getTokenUrl() {
  if (!AZURE_TTS_REGION) throw new Error("AZURE_TTS_REGION not set");
  return `https://${AZURE_TTS_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

// ---- POST /api/tts  -> MP3 audio (Azure TTS)
app.post("/api/tts", async (req, res) => {
  try {
    if (!AZURE_TTS_KEY) return res.status(500).json({ error: "Missing AZURE_TTS_KEY" });
    if (!AZURE_TTS_REGION && !AZURE_TTS_ENDPOINT) {
      return res.status(500).json({ error: "Missing AZURE_TTS_REGION or AZURE_TTS_ENDPOINT" });
    }

    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "No text" });

    const lang = (req.body?.lang || "").toString().toLowerCase();
    const defaultVoice = lang.startsWith("ja") ? DEF_VOICE_JA : DEF_VOICE_EN;
    const voice = (req.body?.voice || defaultVoice).toString().trim();

    // 1) Access token
    const tokenRes = await fetch(getTokenUrl(), {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": AZURE_TTS_KEY },
    });
    if (!tokenRes.ok) {
      const d = await tokenRes.text();
      return res.status(500).json({ error: "Failed to get Azure token", detail: d });
    }
    const token = await tokenRes.text();

    // 2) SSML
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ssml = `
<speak version="1.0" xml:lang="en-US">
  <voice name="${voice}">${esc(text)}</voice>
</speak>`.trim();

    // 3) Synthesize
    const synthRes = await fetch(getSynthesisUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "quiz-app-local",
      },
      body: ssml,
    });
    if (!synthRes.ok) {
      const d = await synthRes.text();
      return res.status(500).json({ error: "Azure TTS failed", detail: d });
    }

    const arrayBuf = await synthRes.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(arrayBuf));
  } catch (err) {
    console.error("[/api/tts] error:", err);
    res.status(500).json({ error: "TTS error", detail: String(err) });
  }
});

// ---- Optional env checks (safe; no secret leakage)
app.get("/api/check-env", (_req, res) => {
  res.json({
    hasKey: !!AZURE_TTS_KEY,
    region: AZURE_TTS_REGION || "(from endpoint)",
    endpoint: !!AZURE_TTS_ENDPOINT,
    defaultVoiceEN: DEF_VOICE_EN,
    defaultVoiceJA: DEF_VOICE_JA,
  });
});

// ---- GPT translation (English -> Japanese), uses OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
let openaiClient = null;
if (OPENAI_API_KEY) {
  const OpenAI = require("openai");
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
}

// Sanity check for OpenAI key (does NOT reveal the key)
app.get("/api/check-openai", (_req, res) => {
  res.json({ hasKey: !!OPENAI_API_KEY });
});

// POST /api/translate  body: { text } -> { translation }
app.post("/api/translate", async (req, res) => {
  try {
    if (!OPENAI_API_KEY || !openaiClient) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    }
    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "No text" });

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful translator for English learners in Japan. Translate the English question into natural, concise Japanese.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
    });

    const jp = completion.choices?.[0]?.message?.content?.trim() || "";
    res.json({ translation: jp || "(翻訳が見つかりませんでした)" });
  } catch (err) {
    console.error("translate-error:", err);
    res.status(500).json({ error: "Translation failed", detail: String(err) });
  }
});

// ---- Start
const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}/`);
});
