import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request) {
  const { meal } = await request.json();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a nutrition expert. When given a meal description, estimate its macronutrients: calories, protein (g), carbohydrates (g), and fat (g). Be concise and provide realistic estimates based on typical portion sizes. Format your response clearly with each macro on its own line.",
    messages: [{ role: "user", content: meal }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
