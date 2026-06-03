import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT =
  'You are a certified fitness and nutrition expert. Given a user\'s current body metrics and goal, provide evidence-based personalised recommendations. Respond with ONLY a JSON object — no markdown, no explanation, no other text. Use this exact format:\n{"target_weight_kg": number, "target_body_fat_pct": number, "target_muscle_mass_pct": number, "target_calories": number, "target_protein": number, "target_carbs": number, "target_fat": number, "explanation": string}\nAll numbers must be realistic. "explanation" should be 2-3 sentences explaining the rationale for these specific targets.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { weight_kg, body_fat_pct, muscle_mass_pct, goal } = body;

  if (!weight_kg || !goal) {
    return Response.json({ error: "Body weight and goal are required" }, { status: 400 });
  }

  const userMessage =
    `Current body weight: ${weight_kg} kg\n` +
    `Body fat: ${body_fat_pct != null ? body_fat_pct + "%" : "not provided"}\n` +
    `Muscle mass: ${muscle_mass_pct != null ? muscle_mass_pct + "%" : "not provided"}\n` +
    `Goal: ${goal}\n\n` +
    `Provide personalised body composition targets and daily macro targets.`;

  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[profile-recommendations] Anthropic error:", err);
    return Response.json({ error: `Claude API error: ${err.message ?? "unknown"}` }, { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log("[profile-recommendations] Claude response:", text);

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("[profile-recommendations] JSON parse failed:", text, err);
    return Response.json({ error: "Failed to parse recommendations" }, { status: 500 });
  }

  return Response.json(data);
}
