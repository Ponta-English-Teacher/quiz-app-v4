// src/utils/dictionary.ts
// Minimal local dictionary stub for the “What does it mean?” button.
// Replace later with your API call (Oxford, custom GPT, etc.).

export type Lang = 'en' | 'ja';

export interface DictEntry {
  english: string;   // learner-style definition (EN)
  japanese: string;  // simple JP translation
  examples?: { en: string; ja: string }[];
}

const MINI_GLOSSARY: Record<string, DictEntry> = {
  "patrol": {
    english: "to move around an area to watch and protect it",
    japanese: "地域を回って見守り、守ること",
    examples: [{ en: "Police patrol the town at night.", ja: "警察は夜に町を巡回します。" }]
  },
  "ripe": {
    english: "ready to eat; fully grown",
    japanese: "食べごろ・十分に成長した",
    examples: [{ en: "The banana is ripe now.", ja: "そのバナナは今食べごろです。" }]
  }
  // add more seed entries as you wish
};

function normalize(key: string) {
  return key.trim().toLowerCase();
}

/**
 * Lookup with soft fallback: if not found, return a safe learner-style paraphrase shell.
 */
export async function lookup(term: string): Promise<DictEntry> {
  const k = normalize(term);
  if (MINI_GLOSSARY[k]) return MINI_GLOSSARY[k];

  // Fallback scaffold so UI always has something to show
  return {
    english: `Meaning of “${term}”: a simple explanation is not available offline.`,
    japanese: `「${term}」の意味：簡単な説明はオフライン辞書にありません。`,
    examples: []
  };
}

/** Helper to build popup payload from selected text */
export async function explainSelection(selection: string) {
  return lookup(selection);
}
