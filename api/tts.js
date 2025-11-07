// api/tts.js — Vercel Serverless Function (Node 18+)
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const { text, lang = 'en', voice } = await readJson(req);
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const REGION = process.env.AZURE_TTS_REGION;
    const ENDPOINT = process.env.AZURE_TTS_ENDPOINT || `https://${REGION}.tts.speech.microsoft.com`;
    const KEY = process.env.AZURE_TTS_KEY;

    if (!REGION || !KEY) {
      res.status(500).json({ error: 'Azure TTS env vars not set' });
      return;
    }

    // Choose a voice
    const defaultEn = process.env.AZURE_TTS_DEFAULT_VOICE_EN || 'en-GB-LibbyNeural';
    const defaultJa = process.env.AZURE_TTS_DEFAULT_VOICE_JA || 'ja-JP-NanamiNeural';
    const selectedVoice = lang === 'ja' ? defaultJa : (voice || defaultEn);

    // Build SSML
    const ssml = `
<speak version="1.0" xml:lang="${lang}">
  <voice name="${selectedVoice}">
    ${escapeXml(text)}
  </voice>
</speak>`.trim();

    // Synthesize
    const synthUrl = `${ENDPOINT}/cognitiveservices/v1`;
    const r = await fetch(synthUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'quiz-app-vercel'
      },
      body: ssml
    });

    if (!r.ok) {
      const errTxt = await safeText(r);
      res.status(502).json({ error: 'Azure TTS failed', status: r.status, detail: errTxt });
      return;
    }

    const arrayBuf = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(arrayBuf));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function readJson(req) {
  // Vercel provides request body already parsed in some runtimes, but be safe:
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function safeText(r) {
  try { return await r.text(); } catch { return ''; }
}
