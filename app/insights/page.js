"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MACROS = [
  { key: "calories", label: "Calories", unit: "kcal", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "protein",  label: "Protein",  unit: "g",    color: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "carbs",    label: "Carbs",    unit: "g",    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { key: "fat",      label: "Fat",      unit: "g",    color: "bg-red-50 border-red-200 text-red-700" },
];

const MEAL_TAGS = [
  { tag: "Breakfast",  color: "bg-amber-100 text-amber-700" },
  { tag: "Lunch",      color: "bg-green-100 text-green-700" },
  { tag: "Snack",      color: "bg-purple-100 text-purple-700" },
  { tag: "Dinner",     color: "bg-blue-100 text-blue-700" },
  { tag: "Late night", color: "bg-gray-200 text-gray-600" },
];
const TAG_COLORS = Object.fromEntries(MEAL_TAGS.map(({ tag, color }) => [tag, color]));

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function sum(items, key) {
  return items.reduce((acc, m) => acc + (m[key] ?? 0), 0);
}

function mealLabel(m) {
  return m.description || m.name || "Meal";
}

function dayColStyle(calories, target, noMeals) {
  if (noMeals) return "bg-gray-100 border-gray-200 text-gray-400";
  if (target == null) return "bg-gray-100 border-gray-200 text-gray-600";
  if (calories > target) return "bg-red-100 border-red-200 text-red-700";
  if (calories >= target * 0.9) return "bg-green-100 border-green-200 text-green-700";
  return "bg-amber-100 border-amber-200 text-amber-700";
}

function macroColor(value, target) {
  if (target == null) return "text-gray-700";
  if (value > target) return "text-red-600";
  if (value >= target * 0.9) return "text-green-600";
  return "text-amber-600";
}

function currentWeekMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function ImageModal({ url, alt, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 transition-colors" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      <img src={url} alt={alt} className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function InsightsPage() {
  const [profile, setProfile] = useState(null);
  const [weekMeals, setWeekMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);
  const [modalAlt, setModalAlt] = useState("");

  useEffect(() => {
    async function fetchData() {
      const monday = currentWeekMonday();
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const [{ data: profileData }, { data: mealsData }] = await Promise.all([
        supabase
          .from("user_profile")
          .select("target_calories, target_protein, target_carbs, target_fat")
          .eq("singleton", true)
          .maybeSingle(),
        supabase
          .from("meals")
          .select("id, description, name, calories, protein, carbs, fat, image_url, meal_tag, created_at")
          .gte("created_at", monday.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: true }),
      ]);

      if (profileData) setProfile(profileData);
      if (mealsData) setWeekMeals(mealsData);
      setLoading(false);
    }
    fetchData();
  }, []);

  // Build week structure
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(todayMidnight);
  const monday = currentWeekMonday();

  const mealsByDate = {};
  for (const meal of weekMeals) {
    const key = toDateStr(new Date(meal.created_at));
    if (!mealsByDate[key]) mealsByDate[key] = [];
    mealsByDate[key].push(meal);
  }

  const weekDays = DAY_LETTERS.map((letter, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = toDateStr(date);
    const meals = mealsByDate[dateStr] ?? [];
    return { letter, dateNum: date.getDate(), dateStr, meals, isToday: dateStr === todayStr, isFuture: date > todayMidnight };
  });

  const selectedDayData = selectedDay ? weekDays.find((d) => d.dateStr === selectedDay) ?? null : null;

  const weeklyTotals = {
    calories: sum(weekMeals, "calories"),
    protein:  sum(weekMeals, "protein"),
    carbs:    sum(weekMeals, "carbs"),
    fat:      sum(weekMeals, "fat"),
  };
  const weeklyTargets = profile?.target_calories ? {
    calories: profile.target_calories * 7,
    protein:  profile.target_protein  * 7,
    carbs:    profile.target_carbs    * 7,
    fat:      profile.target_fat      * 7,
  } : null;

  return (
    <>
      {modalUrl && <ImageModal url={modalUrl} alt={modalAlt} onClose={() => setModalUrl(null)} />}
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="mx-auto w-full max-w-lg flex flex-col gap-5">
          <h1 className="text-2xl font-bold text-gray-900 px-1">Insights</h1>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">This Week</h2>

            {loading ? (
              <p className="text-sm text-gray-400 py-2">Loading…</p>
            ) : (
              <div className="flex flex-col gap-5">

                {/* ── Weekly totals ── */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Weekly Totals</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MACROS.map(({ key, label, unit, color }) => {
                      const logged = weeklyTotals[key];
                      const target = weeklyTargets?.[key] ?? null;
                      return (
                        <div key={key} className={`rounded-xl border p-4 ${color}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
                          <p className="font-bold text-xl mt-1 leading-none">
                            <span className={macroColor(logged, target)}>{logged}</span>
                            {target != null && (
                              <span className="text-sm font-normal opacity-50"> / {target}</span>
                            )}
                            <span className="text-xs font-normal ml-1">{unit}</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {!weeklyTargets && (
                    <p className="text-xs text-gray-400 mt-3">
                      <a href="/profile" className="text-blue-500 hover:underline font-medium">Set up your Profile &amp; Goals</a> to see weekly targets.
                    </p>
                  )}
                </div>

                {/* ── Calendar row ── */}
                <div className="grid grid-cols-7 gap-1.5">
                  {weekDays.map((day) => {
                    const totalCals = sum(day.meals, "calories");
                    const noMeals = day.meals.length === 0;
                    const colStyle = dayColStyle(totalCals, profile?.target_calories, noMeals);
                    const isSelected = selectedDay === day.dateStr;
                    return (
                      <button
                        key={`day-${day.dateStr}`}
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : day.dateStr)}
                        className={`flex flex-col items-center rounded-xl border py-2.5 gap-0.5 transition-all ${colStyle} ${isSelected ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
                      >
                        <span className="text-[10px] font-semibold leading-tight">{day.letter}</span>
                        <span className={`text-sm font-bold leading-tight ${day.isToday ? "underline decoration-2 underline-offset-2" : ""}`}>
                          {day.dateNum}
                        </span>
                        <span className="text-[10px] font-medium leading-tight">
                          {noMeals ? "—" : totalCals}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Expanded day panel ── */}
                {selectedDayData && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <p className="text-xs font-semibold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-100">
                      {selectedDayData.isToday
                        ? "Today"
                        : new Date(selectedDayData.dateStr + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "long", month: "short", day: "numeric",
                          })}
                    </p>
                    {selectedDayData.meals.length === 0 ? (
                      <p className="text-sm text-gray-400 px-3 py-4">No meals logged.</p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-gray-100">
                        {selectedDayData.meals.map((m) => (
                          <li key={`log-${m.id}`} className="flex gap-3 p-3">
                            {m.image_url && (
                              <button
                                type="button"
                                onClick={() => { setModalUrl(m.image_url); setModalAlt(mealLabel(m)); }}
                                className="h-14 w-14 shrink-0 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <img src={m.image_url} alt={mealLabel(m)} className="h-full w-full object-cover" />
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 leading-snug truncate">{mealLabel(m)}</p>
                                  {m.meal_tag && (
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TAG_COLORS[m.meal_tag] ?? "bg-gray-100 text-gray-500"}`}>
                                      {m.meal_tag}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 shrink-0">
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
