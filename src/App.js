import React from "react";
import QuizQuestion from "./components/QuizQuestion";

export default function App() {
  const sampleQuestion = {
    id: 1,
    number: 1,
    text: "Which sentence best states the main idea?",
    choices: [
      "A. Music helps people relax.",
      "B. Music can change your mood.",
      "C. Music improves memory.",
      "D. Music is only for entertainment."
    ],
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <QuizQuestion
        question={sampleQuestion}
        onSelectChoice={(choice, idx) =>
          console.log("Selected choice:", idx, choice)
        }
      />
    </main>
  );
}
