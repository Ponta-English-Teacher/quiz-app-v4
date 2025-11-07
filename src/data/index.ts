// src/data/index.ts
// Lightweight types + data exports + tiny helpers

// ---------- Types ----------
export type Lang = 'en' | 'ja';

export interface Bilingual {
  en: string;
  ja: string;
}

export interface QuizItem {
  id: string;
  level: 'A1' | 'A2' | 'B1' | 'B2';
  category: Bilingual;
  subcategory: Bilingual;
  topic: { id: string; title: Bilingual };
  questionType: 'shortToMC' | 'mcOnly' | 'shortOnly';
  question: Bilingual;
  hints?: Bilingual[];
  choices?: Bilingual[];
  correctAnswer: Bilingual;
  explanation?: Bilingual;
  acceptList?: { en: string }[];
  vocab?: {
    word: Bilingual;
    english: string;
    japanese: string;
    ttsText?: Bilingual;
  }[];
  tts?: {
    voice?: string;
    questionText?: Bilingual;
    explanationText?: Bilingual;
  };
  tags?: string[];
}

// ---------- Data imports ----------
// You will enable JSON imports in tsconfig later (resolveJsonModule: true).
// For now this file is just prepared; it won’t run until the app scaffold is added.
import quizDataA1 from './quizData_A1.json';
import quizDataA2 from './quizData_A2.json';

// Cast to the type for strong hints in editors
export const A1: QuizItem[] = quizDataA1 as QuizItem[];
export const A2: QuizItem[] = quizDataA2 as QuizItem[];

// Combined pool (future: append B1/B2 here)
export const ALL: QuizItem[] = [...A1, ...A2];

// ---------- Helpers ----------
export function byLevel(level: QuizItem['level']): QuizItem[] {
  return ALL.filter((q) => q.level === level);
}

export function byCategory(level: QuizItem['level'], categoryEn: string): QuizItem[] {
  return ALL.filter(
    (q) => q.level === level && q.category.en.toLowerCase() === categoryEn.toLowerCase()
  );
}

export function localizeText(b: Bilingual, lang: Lang): string {
  return lang === 'ja' ? b.ja : b.en;
}
