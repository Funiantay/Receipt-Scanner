import "./globals.css";

export const metadata = {
  title: "Receipt Scanner — Instant Data Extraction",
  description: "Upload a receipt and extract merchant, date, and amount automatically",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
