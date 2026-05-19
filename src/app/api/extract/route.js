export async function POST(request) {
  try {
    const { imageBase64, mediaType } = await request.json();

    if (!imageBase64 || !mediaType) {
      return Response.json({ error: "Missing image data" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
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
                text: `You are a receipt data extraction assistant. Carefully analyze this receipt image.

Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences. Just the raw JSON.

{
  "merchant": "store or restaurant name, or empty string if not found",
  "merchant_confidence": 0.95,
  "date": "YYYY-MM-DD format, or empty string if not found",
  "date_confidence": 0.90,
  "amount": "grand total as number string e.g. 42.50, or empty string if not found",
  "amount_confidence": 0.98,
  "currency": "3-letter ISO code e.g. MYR USD SGD EUR GBP, or empty string if not found",
  "currency_confidence": 0.85,
  "currency_source": "explicit" or "inferred",
  "items": [
    { "name": "Item description", "qty": 1, "price": "5.50" }
  ],
  "subtotal": "pre-tax subtotal as number string, or empty string if not shown",
  "subtotal_confidence": 0.90,
  "tax": "tax amount as number string, or empty string if not shown",
  "tax_confidence": 0.88,
  "tax_label": "tax label e.g. GST 6%, SST 8%, VAT — or empty string",
  "extra_charges": [
    { "label": "Service Charge 10%", "amount": "7.50" }
  ]
}

Rules:
- items: ONLY the purchased goods/food/products. qty is an integer (default 1). price is the line total (qty × unit price) as a number string. DO NOT include subtotal, tax, service charges, discounts, rounding, or any totals here — only actual purchased items.
- extra_charges: ALL additional charges that appear between the subtotal and grand total that are NOT tax. This includes service charges, government levies, packaging fees, delivery fees, rounding adjustments, and discounts. Use negative amounts for discounts/reductions. Use [] if none present.
- subtotal: ALWAYS the pre-discount, pre-extra-charge sum of items — equal to the sum of items[].price. This is the raw items total BEFORE any discount, service charge, or tax is applied. NEVER use a post-discount figure as the subtotal. If the receipt only prints a post-discount subtotal (e.g. some Chinese receipts show 小计 after a discount is already applied), reconstruct the pre-discount subtotal by summing items[].price instead. Empty string if no item prices are shown at all.
- tax: total tax amount only (GST/SST/VAT). Empty string if not shown separately.
- amount: the final grand total the customer paid.
- The sum of items[].price MUST equal subtotal exactly. subtotal + extra_charges + tax must equal amount. Discounts in extra_charges are negative and reduce the total — do NOT also embed them in the subtotal.
- DOUBLE-COUNTING WARNING: If a discount reduces the subtotal printed on the receipt, put the discount in extra_charges as a negative amount and set subtotal to the pre-discount items sum. Never subtract a discount in both subtotal and extra_charges — that counts it twice.
- currency_confidence rules: Set HIGH (0.85–1.0) ONLY when a currency symbol or code is explicitly printed on the receipt (e.g. "RM", "MYR", "$", "USD", "£", "€"). Set LOW (0.15–0.35) when currency is inferred from indirect clues only (merchant name, language, tax label like GST/SST, or price format). Set MEDIUM (0.45–0.65) when there are moderate but not conclusive clues (e.g. "RM" abbreviation without the full code).
- currency_source: "explicit" if currency symbol/code appears on the receipt, "inferred" if guessed from context.
- confidence: float 0.0–1.0 for each extracted field.`,
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

    return Response.json({ success: true, data: parsed });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
