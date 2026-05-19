export async function POST(request) {
  try {
    const { imageBase64, mediaType, extracted } = await request.json();

    if (!imageBase64 || !mediaType || !extracted) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    const fields = ["merchant", "date", "amount", "currency"];
    const presentFields = fields.filter((f) => extracted[f]);
    if (presentFields.length === 0) {
      return Response.json({ success: true, verification: {} });
    }

    const summary = presentFields
      .map((f) => `${f}: "${extracted[f]}"`)
      .join(", ");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: `A previous pass extracted this data from the receipt: ${summary}

Re-examine the receipt image and verify each field. Respond ONLY with a valid JSON object — no markdown, no code fences.

{
  "merchant": { "ok": true, "correction": "" },
  "date": { "ok": true, "correction": "" },
  "amount": { "ok": false, "correction": "18.50" },
  "currency": { "ok": true, "correction": "" }
}

Rules:
- Only include fields that were actually extracted (listed above).
- "ok": true if the value matches what you see in the image, false if wrong or uncertain.
- "correction": the correct value when ok is false; otherwise empty string.
- DATE FORMAT: The "date" field is always in YYYY-MM-DD format, normalized from whatever the receipt shows. If the receipt shows "15/03/2024", "03-15-2024", "March 15 2024", "15 Mar 24" or any other format representing the same calendar date, set ok: true. Only set ok: false if the actual day, month, or year is genuinely wrong. When providing a correction, use YYYY-MM-DD format.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: "Claude API error: " + err }, { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return Response.json({ success: true, verification: parsed });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
