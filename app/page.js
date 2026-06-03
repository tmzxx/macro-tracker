"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const MACROS = [
  { key: "calories", label: "Calories", unit: "kcal", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "protein",  label: "Protein",  unit: "g",    color: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "carbs",    label: "Carbs",    unit: "g",    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { key: "fat",      label: "Fat",      unit: "g",    color: "bg-red-50 border-red-200 text-red-700" },
];

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.8;

async function normalizeFile(file) {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  // Safari natively decodes HEIC — skip conversion if the browser can load it.
  const nativeSupport = await new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(true); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
  if (nativeSupport) return file;

  // Non-Safari: convert via heic2any. Handle both default and named export shapes.
  const mod = await import("heic2any");
  const convert = typeof mod.default === "function" ? mod.default : mod;
  const blob = await convert({ blob: file, toType: "image/jpeg", quality: 1 });
  const result = Array.isArray(blob) ? blob[0] : blob;
  return new File([result], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
    type: "image/jpeg",
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({
            base64: reader.result.split(",")[1],
            mediaType: "image/jpeg",
          });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function sum(meals, key) {
  return meals.reduce((acc, m) => acc + (m[key] ?? 0), 0);
}

function mealLabel(m) {
  return m.description || m.name || "Meal";
}

// ── Spinner ────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── Macro card ─────────────────────────────────────────────────────────────
function MacroCard({ label, value, unit, color, large = false }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className={`font-bold mt-1 leading-none ${large ? "text-2xl" : "text-xl"}`}>
        {value}
        <span className="text-xs font-normal ml-1">{unit}</span>
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Home() {
  const [meal, setMeal] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayMeals, setTodayMeals] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const fileInputRef = useRef(null);

  const fetchTodayMeals = useCallback(async () => {
    setLogLoading(true);
    const { start, end } = todayRange();
    const { data, error: dbError } = await supabase
      .from("meals")
      .select("id, description, name, calories, protein, carbs, fat, image_url, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    if (!dbError) setTodayMeals(data ?? []);
    setLogLoading(false);
  }, []);

  useEffect(() => { fetchTodayMeals(); }, [fetchTodayMeals]);

  async function handleImageChange(e) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    try {
      const file = await normalizeFile(raw);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      setError("Could not load that image. Please try a different file.");
    }
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!meal.trim() && !imageFile) return;
    setLoading(true);
    setResult(null);
    setError("");
    setWarning("");

    try {
      let image = null;
      let mediaType = null;
      if (imageFile) {
        ({ base64: image, mediaType } = await compressImage(imageFile));
      }

      const res = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal, image, mediaType }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        if (data.storage_warning) {
          setWarning(`Photo not saved: ${data.storage_warning}`);
        }
        setMeal("");
        removeImage();
        await fetchTodayMeals();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && (meal.trim() || imageFile);

  const totals = {
    calories: sum(todayMeals, "calories"),
    protein:  sum(todayMeals, "protein"),
    carbs:    sum(todayMeals, "carbs"),
    fat:      sum(todayMeals, "fat"),
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto w-full max-w-lg flex flex-col gap-5">

        {/* ── Input card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-xl font-bold text-gray-900">Macro Tracker</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Describe a meal, upload a photo, or both.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              placeholder="e.g. grilled chicken, brown rice, broccoli"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
              onChange={handleImageChange}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <img
                  src={imagePreview}
                  alt="Meal preview"
                  className="w-full max-h-52 object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-xs px-2.5 py-1 hover:bg-black/80 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-center"
              >
                + Add a photo
              </button>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Spinner />}
              {loading ? "Analyzing…" : "Analyze Meal"}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {warning && (
            <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
              <p className="text-sm text-yellow-700">{warning}</p>
            </div>
          )}

          {result && (
            <div className="mt-5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                {MACROS.map(({ key, label, unit, color }) => (
                  <MacroCard key={key} label={label} value={result[key]} unit={unit} color={color} large />
                ))}
              </div>
              {result.assumptions && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Assumptions</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{result.assumptions}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Today's log card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Today's Log</h2>

          {logLoading ? (
            <p className="text-sm text-gray-400 py-2">Loading…</p>
          ) : todayMeals.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 text-center">
              <p className="text-2xl">🍽️</p>
              <p className="text-sm font-medium text-gray-500">No meals logged yet</p>
              <p className="text-xs text-gray-400">Add your first meal above to start tracking.</p>
            </div>
          ) : (
            <>
              {/* Daily totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {MACROS.map(({ key, label, unit, color }) => (
                  <MacroCard key={key} label={label} value={totals[key]} unit={unit} color={color} />
                ))}
              </div>

              {/* Meal list */}
              <ul className="flex flex-col gap-2">
                {todayMeals.map((m) => (
                  <li key={m.id} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    {m.image_url && (
                      <img
                        src={m.image_url}
                        alt={mealLabel(m)}
                        className="h-14 w-14 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 leading-snug truncate">
                          {mealLabel(m)}
                        </p>
                        <p className="text-xs text-gray-400 shrink-0">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                        <span><strong className="text-gray-700">{m.calories}</strong> kcal</span>
                        <span><strong className="text-gray-700">{m.protein}g</strong> protein</span>
                        <span><strong className="text-gray-700">{m.carbs}g</strong> carbs</span>
                        <span><strong className="text-gray-700">{m.fat}g</strong> fat</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
