# Receipt Scanner

A web app that lets you upload a receipt image and automatically extracts the key information using AI.

**Live demo:** https://receipt-scanner-cyan.vercel.app

---

## How to Run Locally

1. Clone the repo and install dependencies

```bash
git clone https://github.com/Funiantay/receipt-scanner.git
cd receipt-scanner
npm install
```

2. Create a `.env.local` file and add your Anthropic API key

```
ANTHROPIC_API_KEY=your_api_key_here
```

3. Run the development server

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Deploy on Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **Add New Project** and import the `receipt-scanner` repo
4. Add the environment variable before deploying:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
5. Click **Deploy** and wait for it to finish
6. Vercel will give you a live URL that anyone can access

---

## Model & Prompt

**Model used:** `claude-sonnet-4-6` via the Anthropic API

I used two API calls per scan:

The first call sends the receipt image to Claude and asks it to return a JSON with the merchant name, date, total amount, and currency. I also asked it to extract line items, subtotal, tax, and any extra charges like service charge or discounts. Each field comes with a confidence score so I know how sure the model is.

The second call sends the same image again with the extracted values and asks Claude to double check if everything looks correct. If something is wrong it returns a suggested correction which the user can apply with one click.
