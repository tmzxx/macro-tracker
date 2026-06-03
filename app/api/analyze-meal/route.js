import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic();

const SYSTEM_PROMPT =
  'You are a nutrition expert. When given a meal description or image, estimate its macronutrients based on typical portion sizes. Respond with ONLY a JSON object — no markdown, no explanation, no other text. Use this exact format:\n{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "assumptions": string}\n"name" should be a short 2–5 word meal label like "Chicken rice bowl" or "Caesar salad".';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[analyze-meal] Failed to parse request body:", err);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { meal, image, mediaType } = body;

  if (!meal?.trim() && !image) {
    return Response.json({ error: "Provide a meal description or an image" }, { status: 400 });
  }

  console.log("[analyze-meal] meal:", meal || "(none)");
  console.log("[analyze-meal] image provided:", !!image, "mediaType:", mediaType ?? "(none)");
  if (image) {
    console.log("[analyze-meal] base64 length:", image.length, "≈", Math.round(image.length * 0.75 / 1024), "KB");
  }

  const userContent = image
    ? [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
        { type: "text", text: meal?.trim() || "Estimate the macros for the meal in this image." },
      ]
    : meal.trim();

  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    console.error("[analyze-meal] Anthropic API error:", err);
    return Response.json({ error: `Claude API error: ${err.message ?? "unknown"}` }, { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log("[analyze-meal] Claude raw response:", text);

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("[analyze-meal] JSON parse failed. Raw text:", text, "Error:", err);
    return Response.json({ error: "Failed to parse nutrition data" }, { status: 500 });
  }

  // Upload image to Supabase Storage if provided
  let imageUrl = null;
  let storageWarning = null;
  if (image) {
    try {
      const imageBytes = Buffer.from(image, "base64");
      const fileName = `${crypto.randomUUID()}.jpg`;
      const { error: storageError } = await supabase.storage
        .from("meal-images")
        .upload(fileName, imageBytes, { contentType: "image/jpeg" });

      if (storageError) {
        console.error("[analyze-meal] Storage upload error:", storageError);
        storageWarning = storageError.message ?? "Image could not be saved";
      } else {
        const { data: urlData } = supabase.storage.from("meal-images").getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
        console.log("[analyze-meal] Image uploaded:", imageUrl);
      }
    } catch (err) {
      console.error("[analyze-meal] Unexpected storage error:", err);
      storageWarning = err.message ?? "Image upload failed";
    }
  }

  return Response.json({ ...data, image_url: imageUrl, storage_warning: storageWarning });
}
