"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

const CURRENCIES = [
  "MYR","USD","SGD","EUR","GBP","AUD","JPY","CNY","HKD",
  "THB","IDR","PHP","INR","KRW","CAD","AED","SAR",
];

const EMPTY_FORM = { merchant: "", date: "", amount: "", currency: "MYR" };
const STORAGE_KEY = "receipt_scanner_records";

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecord(record) {
  try {
    const records = loadRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

function deleteRecord(id) {
  try {
    const records = loadRecords().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

export default function Home() {
  const [view, setView]                   = useState("home");
  const [file, setFile]                   = useState(null);
  const [fileUrl, setFileUrl]             = useState(null);
  const [scanning, setScanning]           = useState(false);
  const [status, setStatus]               = useState(null);
  const [errorMsg, setErrorMsg]           = useState("");
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [prefilled, setPrefilled]         = useState({});
  const [submitted, setSubmitted]         = useState(false);
  const [record, setRecord]               = useState(null);
  const [dragging, setDragging]           = useState(false);
  const [introVisible, setIntroVisible]   = useState(true);
  const [introLeaving, setIntroLeaving]   = useState(false);
  const [extractDone, setExtractDone]     = useState(false);
  const [confidence, setConfidence]       = useState({});
  const [verifying, setVerifying]         = useState(false);
  const [verification, setVerification]   = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [items, setItems]         = useState([]);
  const [subtotal, setSubtotal]   = useState("");
  const [tax, setTax]             = useState("");
  const [taxLabel, setTaxLabel]       = useState("");
  const [currencySource, setCurrencySource] = useState("");
  const [extraCharges, setExtraCharges] = useState([]);
  const [amountError, setAmountError] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    const t1 = setTimeout(() => setIntroLeaving(true), 1700);
    const t2 = setTimeout(() => setIntroVisible(false), 2380);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (!scanning && !verifying && status === "done") {
      setExtractDone(true);
      const t = setTimeout(() => setExtractDone(false), 700);
      return () => clearTimeout(t);
    }
  }, [scanning, verifying, status]);

  function openHistory() {
    setHistoryRecords(loadRecords());
    setView("history");
  }

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setStatus(null);
    setErrorMsg("");
    setPrefilled({});
    setForm(EMPTY_FORM);
    setSubmitted(false);
    setRecord(null);
    setConfidence({});
    setVerification(null);
    setVerifying(false);
    setItems([]);
    setSubtotal("");
    setTax("");
    setTaxLabel("");
    setExtraCharges([]);
    setCurrencySource("");
    setAmountError("");
  }

  async function scanReceipt() {
    if (!file) return;
    setScanning(true);
    setStatus(null);
    setErrorMsg("");
    setConfidence({});
    setVerification(null);
    setVerifying(false);

    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const mediaType = file.type || "image/jpeg";

      const res  = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unknown error");

      const extracted = json.data;
      const newForm = { ...EMPTY_FORM };
      const newPf   = {};
      const newConf = {};

      for (const key of ["merchant", "date", "amount", "currency"]) {
        const conf = extracted[`${key}_confidence`];
        if (typeof conf === "number") newConf[key] = conf;

        if (extracted[key] && extracted[key] !== "") {
          if (key === "currency") {
            const up = extracted[key].toUpperCase();
            if (CURRENCIES.includes(up)) { newForm[key] = up; newPf[key] = true; }
          } else {
            newForm[key] = extracted[key];
            newPf[key]   = true;
          }
        }
      }

      setForm(newForm);
      setPrefilled(newPf);
      setConfidence(newConf);
      setItems(Array.isArray(extracted.items) ? extracted.items : []);
      setSubtotal(extracted.subtotal || "");
      setTax(extracted.tax || "");
      setTaxLabel(extracted.tax_label || "");
      setExtraCharges(Array.isArray(extracted.extra_charges) ? extracted.extra_charges : []);
      setCurrencySource(extracted.currency_source || "");
      setStatus("done");

      runVerification(base64, mediaType, newForm);
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    } finally {
      setScanning(false);
    }
  }

  async function runVerification(base64, mediaType, extracted) {
    setVerifying(true);
    try {
      const res  = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType, extracted }),
      });
      const json = await res.json();
      if (res.ok && json.success) setVerification(json.verification);
    } catch {
      // best-effort
    } finally {
      setVerifying(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const rawAmount  = form.amount;
    const parts      = String(rawAmount).split(".");
    const formatted  = parts.length === 1 || parts[1].length < 2
      ? parseFloat(rawAmount).toFixed(2)
      : rawAmount;
    const finalForm  = { ...form, amount: formatted };
    setForm(finalForm);
    const saved = { ...finalForm, id: Date.now().toString(), submittedAt: new Date().toISOString() };
    saveRecord(saved);
    setRecord(saved);
    setSubmitted(true);
  }

  function reset() {
    setFile(null);
    setFileUrl(null);
    setStatus(null);
    setErrorMsg("");
    setForm(EMPTY_FORM);
    setPrefilled({});
    setSubmitted(false);
    setRecord(null);
    setScanning(false);
    setConfidence({});
    setVerification(null);
    setVerifying(false);
    setItems([]);
    setSubtotal("");
    setTax("");
    setTaxLabel("");
    setExtraCharges([]);
    setCurrencySource("");
    setAmountError("");
  }

  /* ── history screen ─────────────────────── */
  if (view === "history") {
    return (
      <main className={styles.shell}>
        <TopBar onHistory={openHistory} />
        <div className={styles.historyScreen}>
          <div className={styles.historyHeader}>
            <div>
              <h2 className={styles.historyTitle}>Submission History</h2>
              <p className={styles.historySub}>{historyRecords.length} record{historyRecords.length !== 1 ? "s" : ""} stored locally</p>
            </div>
            <button className={styles.resetLink} onClick={() => setView("home")}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> Back
            </button>
          </div>

          {historyRecords.length === 0 ? (
            <div className={styles.emptyHistory}>
              <i className="ti ti-inbox" aria-hidden="true" />
              <p>No submissions yet</p>
            </div>
          ) : (
            <div className={styles.historyTableWrap}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Merchant</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Submitted at</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((r, i) => (
                    <tr key={r.id}>
                      <td className={styles.historyIdx}>{historyRecords.length - i}</td>
                      <td>{r.merchant || "—"}</td>
                      <td>{r.date || "—"}</td>
                      <td><span className={styles.amountCell}>{r.currency} {r.amount}</span></td>
                      <td className={styles.historyDate}>{new Date(r.submittedAt).toLocaleString()}</td>
                      <td>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => {
                            deleteRecord(r.id);
                            setHistoryRecords((prev) => prev.filter((x) => x.id !== r.id));
                          }}
                          title="Delete"
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ── success screen ─────────────────────── */
  if (submitted && record) {
    return (
      <main className={styles.shell}>
        <TopBar onHistory={openHistory} />
        <div className={styles.successScreen}>
          <div className={styles.successCard}>
            <div className={styles.successIconRing}>
              <i className="ti ti-circle-check" aria-hidden="true" />
            </div>
            <h2 className={styles.successTitle}>Receipt submitted</h2>
            <p className={styles.successSub}>Your data has been recorded successfully</p>
            <table className={styles.successTable}>
              <tbody>
                <tr><td>Merchant</td><td>{record.merchant || "—"}</td></tr>
                <tr><td>Date</td><td>{record.date || "—"}</td></tr>
                <tr><td>Amount</td><td>{record.currency} {record.amount}</td></tr>
                <tr><td>Recorded at</td><td>{new Date(record.submittedAt).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>
          <div className={styles.successActions}>
            <button className={styles.resetLink} onClick={reset}>
              <i className="ti ti-refresh" aria-hidden="true" /> Scan another receipt
            </button>
            <button className={styles.resetLink} onClick={openHistory}>
              <i className="ti ti-history" aria-hidden="true" /> View history
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ── upload screen ──────────────────────── */
  if (!file) {
    return (
      <>
        {introVisible && <IntroOverlay leaving={introLeaving} />}
        <main className={styles.shell}>
          <TopBar onHistory={openHistory} />
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>Scan receipts in seconds</h1>
            <p className={styles.heroSub}>Upload a photo — AI extracts the merchant, date, and amount automatically.</p>
          </div>
          <div className={styles.uploadScreen}>
            <div
              className={`${styles.dropzone} ${dragging ? styles.dropzoneDrag : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div className={styles.uploadIconRing}>
                <i className="ti ti-cloud-upload" aria-hidden="true" />
              </div>
              <p className={styles.dropzoneTitle}>Drop your receipt here</p>
              <p className={styles.dropzoneSub}>or click to browse files from your device</p>
              <div className={styles.formatPills}>
                <span className={styles.formatPill}>JPG</span>
                <span className={styles.formatPill}>PNG</span>
                <span className={styles.formatPill}>WEBP</span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ── review screen ──────────────────────── */
  const canSubmit       = form.merchant && form.date && form.amount && form.currency && !amountError;
  const isDone          = status === "done";
  const isError         = status === "error";
  const verifiedCount   = verification ? Object.values(verification).filter((v) => v.ok).length : 0;
  const correctedCount  = verification ? Object.values(verification).filter((v) => !v.ok && v.correction).length : 0;
  const extractedCount  = Object.keys(confidence).length;
  const avgConf         = extractedCount > 0
    ? Object.values(confidence).reduce((a, b) => a + b, 0) / extractedCount
    : null;
  const fieldProps      = { form, setForm, prefilled, setPrefilled, confidence, verification, setVerification };

  return (
    <main className={styles.shell}>
      <TopBar onHistory={openHistory} />

      <StepBar scanning={scanning} verifying={verifying} isDone={isDone} isError={isError} />

      <div className={styles.reviewLayout}>

        {/* ── left: image ────────────────────── */}
        <div className={styles.imagePanel}>
          <div className={styles.imagePanelHeader}>
            <i className="ti ti-photo" aria-hidden="true" />
            Receipt preview
          </div>
          <div className={styles.imageWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt="Receipt preview" className={styles.previewImg} />
            {scanning && <div className={styles.scanLine} />}
            <div className={styles.imageCorners}>
              <span className={styles.cTL} />
              <span className={styles.cTR} />
              <span className={styles.cBL} />
              <span className={styles.cBR} />
            </div>
            {isDone && !scanning && (
              <div className={styles.scannedBadge}>
                <i className="ti ti-circle-check" aria-hidden="true" />
                Scanned
              </div>
            )}
          </div>

          <div className={styles.imagePanelFooter}>
            <div className={styles.fileChip}>
              <i className="ti ti-file-description" aria-hidden="true" />
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>

            <button
              className={`${styles.scanBtn}${!isDone && !isError && !scanning ? " " + styles.scanBtnPrimary : ""}`}
              onClick={scanReceipt}
              disabled={scanning}
            >
              {scanning
                ? <><span className={styles.spinner} /> Extracting...</>
                : isDone
                ? <><i className="ti ti-refresh" aria-hidden="true" /> Re-scan</>
                : <><i className="ti ti-sparkles" aria-hidden="true" /> Extract with AI</>
              }
            </button>

            {scanning && (
              <div className={`${styles.statusBar} ${styles.statusLoading}`}>
                <span className={styles.spinner} /> AI is reading your receipt...
              </div>
            )}
            {isDone && verifying && (
              <div className={`${styles.statusBar} ${styles.statusLoading}`}>
                <span className={styles.spinner} /> Self-verifying extraction...
              </div>
            )}
            {isDone && !verifying && verification && (
              <div className={`${styles.statusBar} ${correctedCount > 0 ? styles.statusWarn : styles.statusSuccess}`}>
                {correctedCount > 0
                  ? <><i className="ti ti-alert-triangle" aria-hidden="true" /> {correctedCount} suggestion{correctedCount > 1 ? "s" : ""} — review the form</>
                  : <><i className="ti ti-shield-check" aria-hidden="true" /> All {verifiedCount} fields verified</>
                }
              </div>
            )}
            {isDone && !verifying && !verification && (
              <div className={`${styles.statusBar} ${styles.statusSuccess}`}>
                <i className="ti ti-check" aria-hidden="true" />
                {Object.keys(prefilled).length} fields extracted
              </div>
            )}
            {isError && (
              <div className={`${styles.statusBar} ${styles.statusError}`}>
                <i className="ti ti-alert-circle" aria-hidden="true" /> {errorMsg || "Extraction failed. Try again or fill in manually."}
              </div>
            )}
          </div>
        </div>

        {/* ── right: form ────────────────────── */}
        <div className={styles.formPanel}>
          <div className={styles.formPanelHeader}>
            <div className={styles.formPanelHeaderLeft}>
              <i className="ti ti-forms" aria-hidden="true" />
              Extracted fields
            </div>
            {isDone && !scanning && (
              <div className={styles.formHeaderStats}>
                <span className={styles.statChip}>{extractedCount}/4 fields read</span>
                {avgConf !== null && (
                  <span className={`${styles.statChip} ${avgConf >= 0.85 ? styles.statChipGood : avgConf >= 0.6 ? styles.statChipWarn : ""}`}>
                    {Math.round(avgConf * 100)}% accuracy
                  </span>
                )}
              </div>
            )}
          </div>

          {(scanning || verifying || extractDone) ? (
            <ExtractionProgress scanning={scanning} verifying={verifying} done={extractDone} />
          ) : (
            <form onSubmit={handleSubmit} className={styles.formReady}>
              <Field label="Merchant name" name="merchant" placeholder="e.g. Starbucks KLCC" icon="ti-building-store" index={0} {...fieldProps} />

              <div className={styles.twoCol}>
                <Field label="Date" name="date" type="date" icon="ti-calendar" index={1} {...fieldProps} />

                <div className={`${styles.fieldRow} ${styles.fieldRowAnimated}`} style={{ animationDelay: "0.14s" }}>
                  <div className={styles.labelRow}>
                    <div className={styles.fieldIconLabel}>
                      <i className="ti ti-currency-dollar" aria-hidden="true" style={{ fontSize: 11, color: "var(--ink-faint)" }} />
                      <label className={styles.label}>Currency</label>
                    </div>
                    <div className={styles.badges}>
                      {confidence.currency !== undefined && prefilled.currency && (
                        <span
                          className={`${styles.confBadge} ${
                            confidence.currency >= 0.85 ? styles.confHigh :
                            confidence.currency >= 0.6  ? styles.confMed  : styles.confLow
                          }`}
                          title={`AI read accuracy: ${Math.round(confidence.currency * 100)}%`}
                        >
                          {Math.round(confidence.currency * 100)}% accuracy
                        </span>
                      )}
                      {currencySource && prefilled.currency && (
                        <span className={`${styles.sourceBadge} ${currencySource === "explicit" ? styles.sourceExplicit : styles.sourceInferred}`}>
                          {currencySource === "explicit" ? "on receipt" : "inferred"}
                        </span>
                      )}
                      {verification?.currency && prefilled.currency && (
                        <span className={`${styles.verifyBadge} ${verification.currency.ok ? styles.verifyOk : styles.verifyWarn}`}>
                          {verification.currency.ok ? "✓" : "!"}
                        </span>
                      )}
                    </div>
                  </div>
                  <select
                    className={`${styles.input} ${prefilled.currency ? styles.inputPrefilled : ""}`}
                    value={form.currency}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, currency: e.target.value }));
                      setPrefilled((p) => ({ ...p, currency: false }));
                    }}
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <Field
                label="Total amount" name="amount" placeholder="e.g. 42.50" icon="ti-coin" index={3}
                {...fieldProps}
                onValidate={(v) =>
                  setAmountError(
                    v && !/^\d*\.?\d*$/.test(v)
                      ? "Please enter a valid number (e.g. 42.50)"
                      : ""
                  )
                }
                error={amountError}
              />

              <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
                <i className="ti ti-send" aria-hidden="true" /> Submit receipt
              </button>

              {!canSubmit && (
                <p className={styles.hint}>Merchant, date, currency, and amount are required.</p>
              )}
            </form>
          )}

          <button className={styles.resetLink} onClick={reset}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Use a different image
          </button>
        </div>

      </div>

      {isDone && !scanning && (items.length > 0 || subtotal || tax || extraCharges.length > 0) && (
        <BreakdownPanel
          items={items}
          subtotal={subtotal}
          tax={tax}
          taxLabel={taxLabel}
          extraCharges={extraCharges}
          total={form.amount}
          currency={form.currency}
        />
      )}
    </main>
  );
}

function BreakdownPanel({ items, subtotal, tax, taxLabel, extraCharges = [], total, currency }) {
  const calcSubtotal      = items.reduce((s, it) => s + parseFloat(it.price || 0), 0);
  const extractedSubtotal = parseFloat(subtotal || "0");
  const extractedTax      = parseFloat(tax || "0");
  const extractedTotal    = parseFloat(total || "0");
  const totalExtraCharges = extraCharges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  const hasItems    = items.length > 0;
  const hasExtras   = extraCharges.length > 0;
  const subtotalOk  = subtotal ? Math.abs(calcSubtotal - extractedSubtotal) < 0.02 : null;
  const totalOk     = subtotal && total
    ? Math.abs(extractedSubtotal + extractedTax + totalExtraCharges - extractedTotal) < 0.02
    : null;

  const fmt = (n) => n.toFixed(2);

  return (
    <div className={styles.breakdownPanel}>
      <div className={styles.breakdownHeader}>
        <i className="ti ti-receipt-2" aria-hidden="true" />
        Receipt breakdown
        {subtotalOk !== null && (
          <span className={`${styles.calcBadge} ${subtotalOk ? styles.calcOk : styles.calcWarn}`} style={{ marginLeft: "auto" }}>
            {subtotalOk ? "✓ Math checks out" : `Items sum to ${currency} ${fmt(calcSubtotal)}`}
          </span>
        )}
      </div>

      {hasItems && (
        <div className={styles.breakdownTableWrap}>
          <table className={styles.breakdownTable}>
            <thead>
              <tr>
                <th>Item</th>
                <th className={styles.qtyCol}>Qty</th>
                <th className={styles.priceCol}>Price ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className={styles.itemName}>{item.name}</td>
                  <td className={styles.qtyCell}>{item.qty ?? 1}</td>
                  <td className={styles.priceCell}>{fmt(parseFloat(item.price || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.breakdownTotals}>
        {hasItems && (
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>
              <i className="ti ti-calculator" aria-hidden="true" style={{ fontSize: 12 }} />
              Calculated subtotal
            </span>
            <span className={styles.totalValue}>{currency} {fmt(calcSubtotal)}</span>
          </div>
        )}

        {subtotal && (
          <div className={`${styles.totalRow} ${styles.subtotalRow}`}>
            <span className={styles.totalLabel}>
              Subtotal (receipt)
              {subtotalOk !== null && (
                <span className={`${styles.calcBadge} ${subtotalOk ? styles.calcOk : styles.calcWarn}`}>
                  {subtotalOk ? "✓ matches items" : `items sum to ${fmt(calcSubtotal)}`}
                </span>
              )}
            </span>
            <span className={styles.totalValue}>{currency} {fmt(extractedSubtotal)}</span>
          </div>
        )}

        {hasExtras && extraCharges.map((charge, i) => {
          const amt = parseFloat(charge.amount || 0);
          return (
            <div key={i} className={styles.totalRow}>
              <span className={styles.totalLabel}>
                <i className="ti ti-tag" aria-hidden="true" style={{ fontSize: 11 }} />
                {charge.label}
              </span>
              <span className={`${styles.totalValue} ${amt < 0 ? styles.chargeDiscount : ""}`}>
                {amt < 0
                  ? `- ${currency} ${fmt(Math.abs(amt))}`
                  : `+ ${currency} ${fmt(amt)}`}
              </span>
            </div>
          );
        })}

        {tax && (
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>{taxLabel || "Tax"}</span>
            <span className={styles.totalValue}>{currency} {fmt(extractedTax)}</span>
          </div>
        )}

        {subtotal && (
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>
              <i className="ti ti-calculator" aria-hidden="true" style={{ fontSize: 12 }} />
              Calculated total
            </span>
            <span className={styles.totalValue}>{currency} {fmt(extractedSubtotal + totalExtraCharges + extractedTax)}</span>
          </div>
        )}

        {total && (
          <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
            <span className={`${styles.totalLabel} ${styles.grandTotalLabel}`}>
              Grand total (receipt)
              {totalOk !== null && (
                <span className={`${styles.calcBadge} ${totalOk ? styles.calcOk : styles.calcWarn}`}>
                  {totalOk ? "✓ correct" : "does not match"}
                </span>
              )}
            </span>
            <span className={`${styles.totalValue} ${styles.grandTotalValue}`}>{currency} {fmt(extractedTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, icon, index = 0,
                 form, setForm, prefilled, setPrefilled, confidence, verification, setVerification,
                 onValidate, error }) {
  const conf = confidence[name];
  const vf   = verification?.[name];

  return (
    <div className={`${styles.fieldRow} ${styles.fieldRowAnimated}`} style={{ animationDelay: `${index * 0.07}s` }}>
      <div className={styles.labelRow}>
        <div className={styles.fieldIconLabel}>
          {icon && <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 11, color: "var(--ink-faint)" }} />}
          <label className={styles.label}>{label}</label>
        </div>
        <div className={styles.badges}>
          {conf !== undefined && prefilled[name] && (
            <span
              className={`${styles.confBadge} ${
                conf >= 0.85 ? styles.confHigh : conf >= 0.6 ? styles.confMed : styles.confLow
              }`}
              title={`AI read accuracy: ${Math.round(conf * 100)}%`}
            >
              {Math.round(conf * 100)}% accuracy
            </span>
          )}
          {vf && prefilled[name] && (
            <span className={`${styles.verifyBadge} ${vf.ok ? styles.verifyOk : styles.verifyWarn}`}>
              {vf.ok ? "✓" : "!"}
            </span>
          )}
        </div>
      </div>
      <input
        className={`${styles.input} ${prefilled[name] ? styles.inputPrefilled : ""}`}
        type={type}
        placeholder={placeholder}
        value={form[name]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [name]: e.target.value }));
          setPrefilled((p) => ({ ...p, [name]: false }));
          if (onValidate) onValidate(e.target.value);
        }}
      />
      {error && (
        <p className={styles.fieldError}>
          <i className="ti ti-alert-circle" aria-hidden="true" style={{ fontSize: 11, flexShrink: 0 }} />
          {error}
        </p>
      )}
      {vf && !vf.ok && vf.correction && (
        <div className={styles.correctionHint}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true" />
          Suggested correction: <strong>{vf.correction}</strong>
          <button
            type="button"
            className={styles.applyBtn}
            onClick={() => {
              setForm((f) => ({ ...f, [name]: vf.correction }));
              setVerification((v) => ({ ...v, [name]: { ...v[name], ok: true, correction: "" } }));
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

function IntroOverlay({ leaving }) {
  return (
    <div className={`${styles.intro} ${leaving ? styles.introLeaving : ""}`}>
      <div className={styles.introGlow} />
      <div className={styles.introMark}>
        <i className="ti ti-receipt" aria-hidden="true" />
      </div>
      <div className={styles.introText}>
        <div className={styles.introBrand}>Receipt Scanner</div>
        <div className={styles.introTagline}>Instant · Accurate Extraction</div>
      </div>
      <div className={styles.introProgress} />
    </div>
  );
}

function ExtractionProgress({ scanning, verifying, done }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(4);

  const steps = done
    ? ["All fields ready!"]
    : scanning
    ? ["Analyzing image...", "Reading receipt data...", "Extracting fields..."]
    : ["Confirming merchant...", "Checking amounts...", "Verifying accuracy..."];

  useEffect(() => {
    setStepIdx(0);
    const target = done ? 100 : scanning ? 68 : 92;
    const t = setTimeout(() => setProgress(target), 60);
    return () => clearTimeout(t);
  }, [scanning, verifying, done]);

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => setStepIdx(i => (i + 1) % steps.length), 1100);
    return () => clearInterval(iv);
  }, [scanning, verifying, done, steps.length]);

  return (
    <div className={styles.epWrap}>
      <div className={styles.epIconRing}>
        {!done && <span className={styles.epSpinRing} />}
        <i className={`ti ${done ? "ti-circle-check" : scanning ? "ti-sparkles" : "ti-shield-check"}`}
           aria-hidden="true"
           style={done ? { color: "var(--success)", fontSize: 32 } : undefined} />
      </div>

      <div key={steps[stepIdx]} className={styles.epStepText}>{steps[stepIdx]}</div>

      <div className={styles.epTrack}>
        <div className={`${styles.epFill} ${done ? styles.epFillDone : ""}`} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.epPills}>
        <span className={`${styles.epPill} ${scanning ? styles.epPillActive : styles.epPillDone}`}>
          {scanning ? <span className={styles.epDot} /> : <i className="ti ti-check" aria-hidden="true" />}
          Extract
        </span>
        <span className={styles.epPillLine} />
        <span className={`${styles.epPill} ${verifying ? styles.epPillActive : scanning ? styles.epPillPending : styles.epPillDone}`}>
          {verifying ? <span className={styles.epDot} /> : !scanning ? <i className="ti ti-check" aria-hidden="true" /> : null}
          Verify
        </span>
        <span className={styles.epPillLine} />
        <span className={`${styles.epPill} ${done ? styles.epPillReady : styles.epPillPending}`}>
          {done && <i className="ti ti-check" aria-hidden="true" />}
          Ready
        </span>
      </div>
    </div>
  );
}

function StepBar({ scanning, verifying, isDone, isError }) {
  const s2 = scanning || verifying ? "active" : isDone ? "done" : isError ? "error" : "idle";
  const s3 = isDone && !scanning && !verifying ? "active" : "idle";
  return (
    <div className={styles.stepBar}>
      <div className={`${styles.stepItem} ${styles.stepItemDone}`}>
        <div className={styles.stepNum}><i className="ti ti-check" aria-hidden="true" style={{ fontSize: 10 }} /></div>
        <div className={styles.stepLabel}>Upload</div>
      </div>
      <div className={`${styles.stepConnector} ${s2 !== "idle" ? styles.stepConnectorFilled : ""}`} />
      <div className={`${styles.stepItem} ${s2 === "active" ? styles.stepItemActive : s2 === "done" ? styles.stepItemDone : ""}`}>
        <div className={styles.stepNum}>
          {s2 === "active" ? <span className={styles.stepSpinner} /> : s2 === "done" ? <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 10 }} /> : "2"}
        </div>
        <div className={styles.stepLabel}>Extract</div>
      </div>
      <div className={`${styles.stepConnector} ${s3 === "active" ? styles.stepConnectorFilled : ""}`} />
      <div className={`${styles.stepItem} ${s3 === "active" ? styles.stepItemActive : ""}`}>
        <div className={styles.stepNum}>3</div>
        <div className={styles.stepLabel}>Submit</div>
      </div>
    </div>
  );
}

function TopBar({ onHistory }) {
  return (
    <div className={styles.topBar}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <i className="ti ti-receipt" aria-hidden="true" />
        </div>
        <div>
          <div className={styles.brandName}>Receipt Scanner</div>
          <div className={styles.brandTagline}>Instant · Accurate Extraction</div>
        </div>
      </div>
      <button className={styles.historyBtn} onClick={onHistory}>
        <i className="ti ti-history" aria-hidden="true" />
        History
      </button>
    </div>
  );
}
