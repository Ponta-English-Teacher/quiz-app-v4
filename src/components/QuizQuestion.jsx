// src/components/QuizQuestion.jsx
import React from "react";

export default function QuizQuestion({ question, onSelectChoice }) {
  return (
    <section
      className="
        bg-orange-50 border-2 border-orange-400 rounded-2xl p-5 md:p-6
        shadow-sm md:shadow-md mb-6
      "
      role="group"
      aria-labelledby={`q-${question.id}-label`}
    >
      {/* Question header */}
      <div className="flex items-start justify-between mb-4">
        <h2
          id={`q-${question.id}-label`}
          className="text-base md:text-lg font-semibold text-gray-800"
        >
          {question.text}
        </h2>

        {/* optional badge / question number */}
        {typeof question.number !== "undefined" && (
          <span className="ml-3 shrink-0 inline-flex items-center text-xs font-medium bg-orange-100 text-orange-700 border border-orange-300 rounded-full px-2 py-1">
            Q{String(question.number)}
          </span>
        )}
      </div>

      {/* Choices */}
      <ul className="space-y-2">
        {question.choices.map((choice, idx) => (
          <li key={idx}>
            <button
              type="button"
              onClick={() => onSelectChoice?.(choice, idx)}
              className="
                w-full text-left bg-white border border-gray-200 rounded-xl
                px-3 py-2 md:px-4 md:py-3
                hover:bg-orange-50 focus:outline-none
                focus-visible:ring-2 focus-visible:ring-orange-400
                transition
              "
            >
              {choice}
            </button>
          </li>
        ))}
      </ul>

      {/* Optional footer (for hints, next button, etc.) */}
      {question.footer && (
        <div className="mt-4 pt-3 border-t border-orange-200 text-sm text-gray-600">
          {question.footer}
        </div>
      )}
    </section>
  );
}
