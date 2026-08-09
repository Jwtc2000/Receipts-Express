# Project Review & Governance Checklist: Receipts Express

This checklist prepares the **Receipts Express** application for governance review and departmental pilot approval. It is structured after the [AI Pilot Program Template](https://github.com/arigatoexpress/AI-Efficiency/blob/main/docs/pilot-program-template.md) published in the public GitHub repository [arigatoexpress/AI-Efficiency](https://github.com/arigatoexpress/AI-Efficiency) — credit to that project for the checklist format this review is based on. The answers below are the author's own self-assessment; no organization has reviewed or accepted them. Nothing here should be read as FedEx approval, endorsement, or affiliation — Receipts Express is an independent personal project (see the README's [Disclaimer & Data Guidance](../../README.md#disclaimer--data-guidance) section).

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
  * *Mitigation*: All data remains in the local browser profile. There is no telemetry, no analytics, and no cloud API; the only network requests the app makes are for its own files from its own origin — the app shell, and the OCR and PDF engines on first use. GitHub Pages, which serves those files, sees standard web request logs like any host.
* **Security Risk**: Low/Medium.
  * *Mitigation*: The deployed app carries a Content-Security-Policy that restricts fetch, XMLHttpRequest, WebSocket, EventSource and beacon requests to the app's own origin, and blocks form submissions to other origins. It is delivered in a `<meta>` tag, because GitHub Pages cannot send custom response headers, so it does not govern top-level navigation — a compromised dependency could still navigate the page elsewhere. It is a strong control, not an absolute one. A test runs a real production build and asserts that the `<meta>` policy with `connect-src 'self'` is present in the output, so the control cannot be dropped without the suite failing.
  * *Residual risk*: The same `<meta>` delivery means `frame-ancestors` is ignored, so the app has no clickjacking defense as currently hosted; [SECURITY.md](../../SECURITY.md) documents that gap and why its practical impact is low (no login, no session, no server-side action to trigger). Closing it would require a host that can set response headers.
* **Accuracy Risk**: Medium. OCR extraction can produce errors (misreading numbers or merchant names).
  * *Mitigation*: Extracted text is presented as editable drafts in the UI; the user must manually confirm and save.
* **Operational Risk**: Medium. Browser storage is best-effort and can be cleared.
  * *Mitigation*: Clear warnings in the README and SECURITY.md emphasize that it is not an archive and files should be exported immediately. In the app itself, a stale-backup card prompts a backup after 7 days, and a separate banner warns when storage is genuinely not persistent and there is data to lose.
  * *Residual risk*: `navigator.storage.persist()` commonly returns false, and the app treats a refusal as the normal case. On iOS and iPadOS, Safari clears a site's data after about a week without a visit unless durable storage was granted. Installing the app to the Home Screen makes the grant likelier but does not assure it, so backups — not the browser — are what actually protect the data.
  * *Residual risk*: Restoring a backup overwrites records that share an ID with a record already on the device; it is not a merge. The user is asked to confirm before the write, but restoring an older backup over newer edits still replaces them.
* **Legal or Compliance Risk**: Low.
  * *Mitigation*: App is licensed under Apache-2.0 and has clear disclaimers that exported files are subject to standard corporate file-handling policies once saved.
  * *Mitigation*: A [Privacy Policy](../privacy.html) and [Terms of Use](../terms.html) are published as standalone pages and linked from the app under Menu → About. The Privacy Policy documents on-device-only storage, the absence of accounts/analytics/cookies/payments, the sole third party (GitHub Pages, which sees standard web request logs when the app is loaded), and the user's own export/deletion controls. The Terms restate the no-affiliation disclaimer, the Apache-2.0 warranty and liability terms, and the user's responsibility to verify OCR output and to back up before browser storage is evicted.
  * *Mitigation*: Users acknowledge the Terms and Privacy Policy once, on first launch, before using the app — an affirmative act of assent rather than a link in a menu, since disclaimers nobody agreed to are of little use. The acknowledgment is recorded on-device with the terms version.
  * *Mitigation*: The Terms carry governing law and venue (Washington), a liability cap that survives if the blanket exclusion is struck, indemnification, eligibility, acceptable use, and an express disclaimer that exported files are **not** warranted to satisfy Internal Revenue Service substantiation requirements or any employer's reimbursement policy — the user remains responsible for retaining adequate records. Warranty and liability terms are set off conspicuously per RCW 62A.1-201(b)(10).
  * *Mitigation*: A separate [Consumer Health Data Privacy Policy](../consumer-health-data.html) is published and distinctly linked, addressing Washington's My Health My Data Act (chapter 19.373 RCW). A receipt from a pharmacy is the kind of record the Act contemplates; the app never receives it, but the disclosures are made rather than assumed away.
  * *Mitigation*: In August 2026 the project's marketing and pilot material was reviewed against the code and the claims that outran it were rewritten. The Content-Security-Policy was the main one: the origin-scoped, `<meta>`-delivered description in the Security Risk entry above is now the wording carried by [README.md](../../README.md) (§ Security Posture), [SECURITY.md](../../SECURITY.md) and [PILOT_DECK.md](../PILOT_DECK.md) (Slide 4), in place of earlier text that described the policy as an absolute barrier to data leaving the device. Four other claims were rewritten in the Markdown pilot deck and, where they appear, in the README: installing the app improves the odds of a durable-storage grant rather than producing one (`PILOT_DECK.md` Slides 5 and 6); the app adds no encryption of its own over what it stores, so the device's lock screen and disk encryption are what protect it (`PILOT_DECK.md` Slide 3, `README.md` § Features and § How It Works Under the Hood); restore overwrites records that share an ID and asks the user to confirm first, rather than merging (`PILOT_DECK.md` Slide 7); and the app is offline-capable only after the OCR and PDF engines have been fetched from its own origin on first use (`PILOT_DECK.md` Slide 1, `README.md` § How It Works Under the Hood). Material that describes the app to someone deciding whether to use it has to match what the code does; that is the standard applied here.
  * *Mitigation*: A denylist test in [`src/legalPages.test.ts`](../../src/legalPages.test.ts) fails the build if any of seven specific overstatements the audit removed reappears. Its scope is the files listed in `CLAIM_CHECKED_FILES`, which covers the four pages under `docs/`, the pilot and governance markdown, `README.md` and `SECURITY.md`. It matches fixed phrasings rather than judging whether a claim is supportable, so it catches a known overstatement returning, not a new one arriving.
  * *Residual risk*: That review was a pass over the material, not a proof about it, and this entry does not assert that every sentence in every file was checked. The denylist test matches a fixed list of phrasings rather than judging whether a claim is supportable, so wording that overstates in a way the audit did not already name passes it — which is how the HTML pilot deck kept claims its Markdown twin had already lost. A reviewer should read the pilot deck and the published pages rather than take this section as a clean bill.
  * *Mitigation*: Pilot material no longer states any organization's internal filing deadline or retention target, and no longer names specific cloud storage providers in a recommended order. Both were assertions about an organization's internal process that this project is in no position to make. Participants are pointed to whatever storage their organization approves at this classification, and told to start on synthetic receipts before any real trip.
  * *Residual risk*: These pages were drafted without attorney review, and this accuracy pass did not change that. **Recommendation: a Washington attorney should review the published privacy, terms, and consumer-health-data pages before the pilot handles real employer expense data**, consistent with the "Legal / compliance review needed? Yes" answer in [PILOT.md](../PILOT.md).
* **Brand or External-Sharing Risk**: Low.
  * *Mitigation*: Explicit disclaimers in the README, PILOT.md, and the pilot deck note that the project has no affiliation with, endorsement from, or approval by FedEx or any employer. The governance checklist this project borrows is credited as the AI Pilot Program Template published in the public GitHub repository [arigatoexpress/AI-Efficiency](https://github.com/arigatoexpress/AI-Efficiency), with no corporate framing attached to it.
* **Stop Condition**: If any data exfiltration path is identified, or if browser CSP rules are bypassed, or if a browser vulnerability exposes IndexedDB storage to unauthorized apps.

---

## 5. Production Readiness

* **Approved tool and account are used**: Not yet — the app has not been reviewed or approved by any organization's governance process, and [PILOT.md](../PILOT.md) is the proposal to start that review. Self-assessment: it uses only standard browser APIs and client-side libraries, and requires no account of any kind.
* **Data classification is documented**: Yes, documented in `SECURITY.md` and `docs/PILOT.md`.
* **Access controls are documented**: Yes, restricted to local device/browser profile access.
* **Human review path is documented**: Yes, user edit gate prior to database save.
* **Monitoring or audit log exists**: N/A (entirely local client-side application; user action history is not logged to any server to preserve privacy).
* **Failure mode is understood**: Yes, OCR failures result in manual form fallback; browser storage eviction results in local data loss.
* **Owner and backup owner are named**: TBD — proposing department's pilot sponsor / (Backup TBD by pilot department).
* **Governance approval is recorded**: Pending.

---

## 6. Meeting Demo Readiness

* **Demo uses synthetic or approved data**: Yes. Demonstrations use synthetic receipts, and participants are told to start on synthetic or already-public receipts before using the app on a real trip. Real-trip capture puts real employee financial data on the device, so it should not begin until the proposing organization's reviewer has agreed the app may hold data at this classification. Data should be exported and then deleted from the device once the report is filed, on whatever schedule that organization sets.
* **Demo script is written**: TBD.
* **Known limitations are stated up front**: Yes, explicitly listed (client-side only; offline once the OCR and PDF engines have been fetched on first use; storage is subject to eviction; no clickjacking defense as hosted).
* **No secrets or private dashboards are visible**: Verified.
* **Screenshots are scrubbed**: Verified.
* **Live-action buttons are disabled or clearly simulated**: All UI actions run entirely locally and do not interact with live backend systems.
