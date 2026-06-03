"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const GOALS = [
  { value: "Lose fat",              desc: "Reduce body fat while preserving muscle" },
  { value: "Build muscle",          desc: "Gain lean mass with a calorie surplus" },
  { value: "Body recomposition",    desc: "Lose fat and gain muscle simultaneously" },
  { value: "Maintain",              desc: "Keep current weight and composition" },
];

const TARGET_MACROS = [
  { key: "target_calories", label: "Calories", unit: "kcal", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "target_protein",  label: "Protein",  unit: "g",    color: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "target_carbs",    label: "Carbs",    unit: "g",    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { key: "target_fat",      label: "Fat",      unit: "g",    color: "bg-red-50 border-red-200 text-red-700" },
];

function NumberInput({ label, value, onChange, placeholder, min, max, step = "0.1", required = false }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

export default function ProfilePage() {
  const [weight, setWeight]         = useState("");
  const [bodyFat, setBodyFat]       = useState("");
  const [muscleMass, setMuscleMass] = useState("");
  const [goal, setGoal]             = useState("");
  const [recs, setRecs]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from("user_profile")
          .select("*")
          .eq("singleton", true)
          .maybeSingle();
        if (error) {
          console.error("[profile] fetch error:", error);
          return;
        }
        if (!data) return;
        setWeight(data.weight_kg?.toString() ?? "");
        setBodyFat(data.body_fat_pct?.toString() ?? "");
        setMuscleMass(data.muscle_mass_pct?.toString() ?? "");
        setGoal(data.goal ?? "");
        if (data.target_calories) {
          setRecs({
            target_weight_kg:       data.target_weight_kg,
            target_body_fat_pct:    data.target_body_fat_pct,
            target_muscle_mass_pct: data.target_muscle_mass_pct,
            target_calories:        data.target_calories,
            target_protein:         data.target_protein,
            target_carbs:           data.target_carbs,
            target_fat:             data.target_fat,
            explanation:            data.explanation,
          });
        }
      } finally {
        setPageLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleCalculate() {
    if (!weight || !goal) return;
    setLoading(true);
    setError("");
    try {
      const metrics = {
        weight_kg:       Number(weight),
        body_fat_pct:    bodyFat    ? Number(bodyFat)    : null,
        muscle_mass_pct: muscleMass ? Number(muscleMass) : null,
      };

      const res = await fetch("/api/profile-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metrics, goal }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setRecs(data);

      // Persist metrics + goal + AI targets to Supabase.
      const { error: dbError } = await supabase.from("user_profile").upsert(
        {
          singleton:              true,
          ...metrics,
          goal,
          target_weight_kg:       data.target_weight_kg,
          target_body_fat_pct:    data.target_body_fat_pct,
          target_muscle_mass_pct: data.target_muscle_mass_pct,
          target_calories:        data.target_calories,
          target_protein:         data.target_protein,
          target_carbs:           data.target_carbs,
          target_fat:             data.target_fat,
          explanation:            data.explanation,
          updated_at:             new Date().toISOString(),
        },
        { onConflict: "singleton" }
      );
      if (dbError) {
        console.error("[profile] upsert error:", dbError);
        setError("Targets calculated but could not be saved. Check your Supabase setup.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto w-full max-w-lg flex flex-col gap-5">

        {/* ── Metrics & Goal ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-xl font-bold text-gray-900">Profile & Goals</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Enter your metrics and select a goal to get personalised daily targets.
          </p>

          <div className="flex flex-col gap-6">

            {/* Metrics */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">My Metrics</h2>
              <div className="flex flex-col gap-3">
                <NumberInput
                  label="Body weight (kg)"
                  value={weight}
                  onChange={setWeight}
                  placeholder="e.g. 75"
                  min="30"
                  max="300"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Body fat %"
                    value={bodyFat}
                    onChange={setBodyFat}
                    placeholder="e.g. 20"
                    min="3"
                    max="60"
                  />
                  <NumberInput
                    label="Muscle mass %"
                    value={muscleMass}
                    onChange={setMuscleMass}
                    placeholder="e.g. 40"
                    min="20"
                    max="70"
                  />
                </div>
              </div>
            </div>

            {/* Goal */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">My Goal</h2>
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map(({ value, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGoal(value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      goal === value
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className={`text-sm font-semibold leading-snug ${goal === value ? "text-blue-700" : "text-gray-800"}`}>
                      {value}
                    </p>
                    <p className={`text-xs mt-0.5 leading-snug ${goal === value ? "text-blue-500" : "text-gray-400"}`}>
                      {desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={!weight || !goal || loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Calculating…" : "Calculate My Targets"}
            </button>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Recommendations ── */}
        {recs && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">
            <h2 className="text-base font-bold text-gray-900">Your Targets</h2>

            {/* Body composition */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Body Composition</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Weight",    value: recs.target_weight_kg,       unit: "kg" },
                  { label: "Body fat",  value: recs.target_body_fat_pct,    unit: "%" },
                  { label: "Muscle",    value: recs.target_muscle_mass_pct, unit: "%" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-800 leading-none">
                      {value}
                      <span className="text-xs font-normal ml-0.5">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily macros */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Daily Macro Targets</p>
              <div className="grid grid-cols-2 gap-3">
                {TARGET_MACROS.map(({ key, label, unit, color }) => (
                  <div key={key} className={`rounded-xl border p-4 ${color}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
                    <p className="font-bold text-xl mt-1 leading-none">
                      {recs[key]}
                      <span className="text-xs font-normal ml-1">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanation */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Why these targets?</p>
              <p className="text-sm text-gray-600 leading-relaxed">{recs.explanation}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
