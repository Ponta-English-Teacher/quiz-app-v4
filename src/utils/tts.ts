// src/utils/tts.ts
// Phone/desktop demo via Web Speech API (no keys needed).
// Later, swap to Azure by calling your server API with the same function shape.

export type Lang = 'en' | 'ja';

const ENV = {
  enVoice:
    import.meta.env.NEXT_PUBLIC_TTS_VOICE_EN ??
    'en-GB Libby', // browser voice label (not Azure name)
  jaVoice:
    import.meta.env.NEXT_PUBLIC_TTS_VOICE_JA ??
    'Kyoko', // common on Apple devices. Android may use "ja-JP" default
};

// Small helper to pick a browser voice by (name OR lang startsWith)
function pickVoice(lang: Lang, desiredName?: string): SpeechSynthesisVoice | undefined {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return undefined;

  const voices = synth.getVoices();
  if (!voices || voices.length === 0) return undefined;

  // 1) try exact name match (varies per OS/browser)
  if (desiredName) {
    const byName = voices.find(v => v.name.toLowerCase().includes(desiredName.toLowerCase()));
    if (byName) return byName;
  }

  // 2) fallback by language code
  const target = lang === 'ja' ? 'ja-JP' : 'en-';
  const byLang = voices.find(v => (v.lang || '').toLowerCase().startsWith(target.toLowerCase()));
  return byLang ?? voices[0];
}

/**
 * Speak plain text on device (web speech). Works on iOS/Android/desktop.
 * Returns false if speech isn't available.
 */
export function speakText(text: string, lang: Lang = 'en', opts?: { rate?: number; pitch?: number }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

  // Edge/Chrome sometimes need a warm-up to load voices
  const synth = window.speechSynthesis;
  const utter = new SpeechSynthesisUtterance(text);

  const desired = lang === 'ja' ? ENV.jaVoice : ENV.enVoice;
  const voice = pickVoice(lang, desired);
  if (voice) utter.voice = voice;

  utter.lang = voice?.lang ?? (lang === 'ja' ? 'ja-JP' : 'en-US');
  utter.rate = opts?.rate ?? 1.0;
  utter.pitch = opts?.pitch ?? 1.0;

  synth.cancel(); // stop any previous speech
  synth.speak(utter);
  return true;
}

/** Optional: create an SSML payload for Azure TTS later */
export function buildAzureSSML(text: string, lang: Lang = 'en', voice?: string) {
  const azureVoice =
    voice ??
    (lang === 'ja' ? 'ja-JP-NanamiNeural' : 'en-GB-LibbyNeural'); // your defaults later

  return `
<speak version="1.0" xml:lang="${lang === 'ja' ? 'ja-JP' : 'en-US'}">
  <voice name="${azureVoice}">
    ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}
  </voice>
</speak>`.trim();
}
