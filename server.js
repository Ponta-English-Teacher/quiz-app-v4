// server.js — static hosting + Azure TTS proxy (no prosody)

require("dotenv").config({ path: ".env.local" });
const express = require("express");
const path = require("path");
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY || "";
const AZURE_TTS_REGION = process.env.AZURE_TTS_REGION || "";
const DEF_VOICE_EN = process.env.AZURE_TTS_VOICE || process.env.AZURE_TTS_DEFAULT_VOICE_EN || "en-GB-LibbyNeural";
const DEF_VOICE_JA = process.env.AZURE_TTS_DEFAULT_VOICE_JA || "ja-JP-NanamiNeural";

function synthUrl() { return `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`; }
function tokenUrl() { return `https://${AZURE_TTS_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`; }

async function getToken() {
  const r = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": AZURE_TTS_KEY, "Content-Length": "0" },
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Token ${r.status}: ${body}`);
  return body;
}

function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function pickVoice({ lang, voice }) {
  if (voice) return String(voice);
  const l = String(lang||"").toLowerCase();
  return l.startsWith("ja") ? DEF_VOICE_JA : DEF_VOICE_EN;
}

async function synthAzure({ text, lang, voice }) {
  if (!AZURE_TTS_KEY) throw new Error("Missing AZURE_TTS_KEY");
  if (!AZURE_TTS_REGION) throw new Error("Missing AZURE_TTS_REGION");
  if (!text) throw new Error("No text provided");

  const token = await getToken();
  const ssml = `<speak version="1.0" xml:lang="${lang || "en-US"}"><voice name="${voice}">${esc(text)}</voice></speak>`;

  const r = await fetch(synthUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
      "User-Agent": "quiz-app-v4",
    },
    body: ssml,
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("[Azure 4xx/5xx]", r.status, body);
    const e = new Error(`Azure TTS failed ${r.status}`);
    e._detail = body;
    throw e;
  }
  return Buffer.from(await r.arrayBuffer());
}

app.post("/api/tts", async (req, res) => {
  try {
    const text = (req.body?.text||"").toString().slice(0,1000).trim();
    const lang = (req.body?.lang||"en-US").toString();
    const voice = pickVoice({ lang, voice: req.body?.voice });
    const audio = await synthAzure({ text, lang, voice });
    res.setHeader("Content-Type","audio/mpeg");
    res.setHeader("Cache-Control","no-store");
    res.end(audio);
  } catch (e) {
    res.status(500).send(e._detail || String(e));
  }
});

app.get("/api/tts", async (req, res) => {
  try {
    const text = (req.query?.text||"").toString().slice(0,1000).trim();
    const lang = (req.query?.lang||"en-US").toString();
    const voice = pickVoice({ lang, voice: req.query?.voice });
    const audio = await synthAzure({ text, lang, voice });
    res.setHeader("Content-Type","audio/mpeg");
    res.setHeader("Cache-Control","no-store");
    res.end(audio);
  } catch (e) {
    res.status(500).send(e._detail || String(e));
  }
});

app.get("/api/check-env", (_req,res)=>{
  res.json({
    hasKey: !!AZURE_TTS_KEY,
    region: AZURE_TTS_REGION,
    defaultVoiceEN: DEF_VOICE_EN,
    defaultVoiceJA: DEF_VOICE_JA,
  });
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, ()=>console.log(`Server running: http://localhost:${PORT}/`));
