# Receipt Scanner — AI-Powered Receipt Extraction

A web app that extracts key fields from a receipt photo using the Claude AI API and pre-fills a form that the user can review, edit, and submit.

Built for the **TP Malaysia AI Intern Assessment**.

---

## Live Demo

> Vercel URL: _(add after deployment)_

---

## Features

- Upload a receipt image (JPG, PNG, WEBP) via drag-and-drop or file picker
- AI extracts merchant name, date, total amount, and currency automatically
- Form is pre-filled with extracted data — fully editable before submission
- Confidence score shown per field (how certain the AI is about each value)
- Currency source badge — indicates whether currency was explicitly on the receipt or inferred
- Second AI verification pass cross-checks every extracted field against the image
- Receipt breakdown panel — lists all line items, subtotal, extra charges, tax, and grand total with math verification
- Submissions saved to `localStorage` with a browsable history view
- Intro animation, step progress bar, and extraction progress indicator

---

## Fields Extracted

| Field | Example |
|-------|---------|
| Merchant name | Starbucks KLCC |
| Date | 2025-03-14 |
| Total amount | 42.50 |
| Currency | MYR |

Bonus fields (shown in breakdown panel):

| Field | Description |
|-------|-------------|
| Line items | Each purchased item with qty and price |
| Subtotal | Pre-discount, pre-tax items sum |
| Tax | GST / SST / VAT amount and label |
| Extra charges | Service charge, discounts, rounding |

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| AI model | Anthropic Claude (`claude-sonnet-4-6`) |
| Styling | CSS Modules |
| Storage | localStorage (client-side) |
| Deployment | Vercel |

---

## How to Run Locally

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/receipt-scanner.git
cd receipt-scanner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Add your API key

Create a `.env.local` file in the project root:

```
ANTHROPIC_API_KEY=your_api_key_here
```

Get your key at: https://console.anthropic.com

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to Deploy on Vercel

1. Push this repo to GitHub (public)
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo
3. In the Vercel project settings, go to **Environment Variables** and add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
4. Click **Deploy**

---

## AI Model & Prompt

### Model

`claude-sonnet-4-6` — used for both the extraction pass and the verification pass.

### Extraction prompt (Pass 1)

Sent to Claude with the receipt image (base64). Instructs the model to return a raw JSON object — no markdown, no explanation. Key rules enforced in the prompt:

- **`items[]`** — only purchased goods/products; never includes subtotal, tax, or charges
- **`subtotal`** — always the pre-discount sum of `items[].price`; the AI must not use a post-discount figure even if that is what is printed (common on Chinese receipts)
- **`extra_charges[]`** — everything between subtotal and grand total that is not tax: service charges, discounts (negative amounts), rounding
- **`tax`** — GST / SST / VAT only
- **`amount`** — the final grand total the customer paid
- **Math invariant enforced:** `sum(items[].price) = subtotal` and `subtotal + extra_charges + tax = amount`
- **`currency_confidence`** — HIGH (≥ 0.85) only when a symbol or code is explicitly printed; LOW (≤ 0.35) when inferred from context (merchant name, language, tax label)
- **`currency_source`** — `"explicit"` or `"inferred"`
- Confidence float (0–1) returned for every extracted field

### Verification prompt (Pass 2)

A second Claude call re-examines the same image after extraction. It receives the extracted values as a summary and independently checks each field, returning `{ ok: bool, correction: string }` per field. Special rule: the `date` field is compared semantically (YYYY-MM-DD is treated as equivalent to `15/03/2024` or `March 15 2024` on the receipt).

If any field is flagged, the UI shows a yellow correction hint with an **Apply** button.
