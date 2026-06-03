import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic();

const VISUAL_SYSTEM_PROMPT =
  'You are a nutrition expert specialising in visual portion estimation. Estimate the macronutrients of the meal shown or described. Use visual cues to estimate realistic gram weights: compare food volume to the plate or bowl size, note packing density, use any visible reference objects such as hands or utensils, and apply typical serving sizes for the cuisine. Your estimates should reflect realistic real-world portions — do not default to textbook serving sizes if the image clearly shows a larger or smaller amount. Respond with ONLY a JSON object — no markdown, no explanation, no other text. Use this exact format:\n{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "assumptions": string}\n"name" should be a short 2–5 word meal label. "assumptions" should describe the specific portion weights you estimated and the visual cues you used.';

const RECALC_SYSTEM_PROMPT =
  'You are a nutrition expert. The user has described a meal with specific quantities. Calculate macronutrients strictly from the portions stated — ignore any previous estimates entirely. Treat every quantity mentioned as exact and authoritative: if the text says 15 cups of chicken breast, calculate macros for exactly 15 cups of chicken breast. Do not second-guess or adjust the stated amounts. Respond with ONLY a JSON object — no markdown, no explanation, no other text. Use this exact format:\n{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "assumptions": string}\n"name" should be a short 2–5 word meal label. "assumptions" should confirm the exact portions used in the calculation.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[analyze-meal] Failed to parse request body:", err);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { meal, image, mediaType, mode } = body;
  const isRecalc = mode === "recalculate";

  if (!meal?.trim() && !image) {
    return Response.json({ error: "Provide a meal description or an image" }, { status: 400 });
  }

  console.log("[analyze-meal] meal:", meal || "(none)");
  console.log("[analyze-meal] image provided:", !!image, "mediaType:", mediaType ?? "(none)");
  if (image) {
    console.log("[analyze-meal] base64 length:", image.length, "≈", Math.round(image.length * 0.75 / 1024), "KB");
  }

  const userContent = (!isRecalc && image)
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
      system: isRecalc ? RECALC_SYSTEM_PROMPT : VISUAL_SYSTEM_PROMPT,
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
