import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT =
  'You are a concise nutrition coach. Given the user\'s daily macro targets and what they have left for the day, write exactly one encouraging sentence that identifies the single most important macro to focus on and suggests a specific, practical food action. Example style: "With 80g of protein still to go, adding a palm-sized portion of chicken breast or two eggs to your next meal will keep you right on track." Respond with only that one sentence — no greeting, no sign-off, no bullet points, no line breaks.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { remaining, targets, mealsLogged } = body;

  if (!targets?.calories) {
    return Response.json({ error: "No targets provided" }, { status: 400 });
  }

  const userMessage =
    `Daily targets: ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat\n` +
    `Remaining today: ${Math.round(remaining.calories)} kcal, ${Math.round(remaining.protein)}g protein, ${Math.round(remaining.carbs)}g carbs, ${Math.round(remaining.fat)}g fat\n` +
    `Meals logged so far today: ${mealsLogged}`;

  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[coaching] Anthropic error:", err);
    return Response.json({ error: "Claude API error" }, { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text?.trim() ?? "";
  return Response.json({ text });
}
