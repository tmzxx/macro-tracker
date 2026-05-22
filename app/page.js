"use client";

import { useState } from "react";

export default function Home() {
  const [meal, setMeal] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!meal.trim()) return;
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal }),
      });
      const text = await res.text();
      setResult(text);
    } catch {
      setResult("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Macro Tracker
        </h1>
        <p className="text-gray-500 mb-6 text-sm">
          Describe a meal and get an estimated macro breakdown.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            placeholder="e.g. grilled chicken breast with brown rice and broccoli"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !meal.trim()}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analyzing…" : "Analyze Meal"}
          </button>
        </form>

        {result && (
          <div className="mt-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Macro Estimate
            </h2>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}
