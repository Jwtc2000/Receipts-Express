# Project Review & Governance Checklist: Receipts Express

This checklist prepares the **Receipts Express** application for governance review and departmental pilot approval. It is structured after the [AI Pilot Program Template](https://github.com/arigatoexpress/AI-Efficiency/blob/main/docs/pilot-program-template.md) from the FedEx AI Efficiency Hub ([arigatoexpress/AI-Efficiency](https://github.com/arigatoexpress/AI-Efficiency)) — credit to that project for the checklist format this review is based on. Nothing here should be read as FedEx approval, endorsement, or affiliation — Receipts Express is an independent personal project (see the README's [Disclaimer & Data Guidance](../../README.md#disclaimer--data-guidance) section).

---

## 1. Project Basics

* **Project Name**: Receipts Express — standardized receipt-to-PDF capture
* **Owner**: TBD — proposing department's pilot sponsor
* **Audience**: Employees who travel and file expense reports
* **Problem Statement**: Travel expense filing is slow and error-prone when receipts are kept loose (paper or camera roll) until trip's end, then manually reconstructed into a report.
* **Current Manual Process**: Employee collects paper or photo receipts during travel, then manually transcribes merchant, date, and amount for each into the corporate expense system.
* **Expected Benefit**: Standardize and speed up the capture step *before* entering data into the corporate expense system, reducing filing latency and user friction.
* **Demo Link or Folder**: [Jwtc2000/Receipts-Express](https://github.com/Jwtc2000/Receipts-Express)
* **Current Status**: Prototype / Pilot Proposal

---

## 2. Data Review

* **If the data is not clearly public or synthetic, pause before use and classify it first.**
  * *Classification*: **Confidential / Restricted**. 
  * Receipts contain real personal and financial data (merchant names, transaction dates, itemized purchase list, amounts, and partial card numbers).
* **What data does the project use?**
  * Receipt images and the extracted merchant name, date, total, and itemized details.
* **Is the data public, synthetic, internal, confidential, regulated, or unknown?**
  * Confidential.
* **Does it include customer, employee, package, route, facility, security, or financial data?**
  * Yes, employee financial data (personal travel expenses, purchase details). No package, route, customer, or security data.
* **Where is the data stored?**
  * Exclusively on-device in the browser's IndexedDB. No server storage or third-party backup.
* **Who can access it?**
  * Only the employee who has physical/logical access to the browser profile on their device.
* **How long is it retained?**
  * Indefinitely in IndexedDB until manually deleted by the user or cleared by browser storage eviction. Note that this is a capture-and-export utility, not a long-term archive.

---

## 3. AI Behavior

* **What does the AI produce?**
  * Heuristically parses text scanned from a receipt image (via client-side OCR) to identify merchant name, transaction date, and total amount, pre-filling a form. The image is either a camera photo or a page rasterized on-device (via client-side PDF.js, same no-cloud-vendor model as the OCR step) from an uploaded PDF receipt.
* **Can the AI take actions, or does it only draft and summarize?**
  * It only drafts/pre-fills inputs in the local user interface. It cannot take actions or interact with external systems.
* **Who is the named human owner responsible for reviewing outputs?**
  * The employee (user) scanning the receipt is responsible for reviewing and editing all values before saving and exporting.
* **Does the system show uncertainty and assumptions?**
  * Yes. When OCR succeeds, the UI displays: `"Details extracted — review and adjust below"`. If it fails, it displays: `"Couldn't read the receipt — enter details manually"`.
* **Is there a record of what source material was used?**
  * Yes, the original receipt image is stored alongside the record in IndexedDB and is embedded in the exported PDF.

---

## 4. Risk Review

* **Privacy Risk**: Low/Medium. Receipts contain personal financial data.
  * *Mitigation*: All data remains in the local browser profile; no telemetry, cloud APIs, or network transfers are used.
* **Security Risk**: Low.
  * *Mitigation*: A strict Content-Security-Policy (CSP) of `connect-src 'self'` prevents any network exfiltration of data. Unit-tested at build time.
* **Accuracy Risk**: Medium. OCR extraction can produce errors (misreading numbers or merchant names).
  * *Mitigation*: Extracted text is presented as editable drafts in the UI; the user must manually confirm and save.
* **Operational Risk**: Low. Ephemeral browser storage can be cleared.
  * *Mitigation*: Clear warnings in the README and SECURITY.md emphasize that it is not an archive and files should be exported immediately.
* **Legal or Compliance Risk**: Low.
  * *Mitigation*: App is licensed under Apache-2.0 and has clear disclaimers that exported files are subject to standard corporate file-handling policies once saved.
  * *Mitigation*: A [Privacy Policy](../privacy.html) and [Terms of Use](../terms.html) are published as standalone pages and linked from the app under Menu → About. The Privacy Policy documents on-device-only storage, the absence of accounts/analytics/cookies/payments, the sole third party (GitHub Pages, which sees standard web request logs when the app is loaded), and the user's own export/deletion controls. The Terms restate the no-affiliation disclaimer, the Apache-2.0 warranty and liability terms, and the user's responsibility to verify OCR output and to back up before browser storage is evicted.
* **Brand or External-Sharing Risk**: Low.
  * *Mitigation*: Explicit disclaimers in the README and PILOT.md note that the project has no affiliation with or endorsement from FedEx.
* **Stop Condition**: If any data exfiltration path is identified, or if browser CSP rules are bypassed, or if a browser vulnerability exposes IndexedDB storage to unauthorized apps.

---

## 5. Production Readiness

* **Approved tool and account are used**: Yes, uses standard browser APIs and client-side libraries.
* **Data classification is documented**: Yes, documented in `SECURITY.md` and `docs/PILOT.md`.
* **Access controls are documented**: Yes, restricted to local device/browser profile access.
* **Human review path is documented**: Yes, user edit gate prior to database save.
* **Monitoring or audit log exists**: N/A (entirely local client-side application; user action history is not logged to any server to preserve privacy).
* **Failure mode is understood**: Yes, OCR failures result in manual form fallback; browser storage eviction results in local data loss.
* **Owner and backup owner are named**: TBD — proposing department's pilot sponsor / (Backup TBD by pilot department).
* **Governance approval is recorded**: Pending.

---

## 6. Meeting Demo Readiness

* **Demo uses synthetic or approved data**: Yes. Demonstrations use synthetic data, while the pilot allows real-world receipt capture during travel. Data exposure is limited to under 10 days in the local browser sandbox, aligned with corporate deadlines (reports submitted by Wednesday post-trip).
* **Demo script is written**: TBD.
* **Known limitations are stated up front**: Yes, explicitly listed (offline, client-side, storage is subject to eviction).
* **No secrets or private dashboards are visible**: Verified.
* **Screenshots are scrubbed**: Verified.
* **Live-action buttons are disabled or clearly simulated**: All UI actions run entirely locally and do not interact with live backend systems.
