# Pilot Proposal: Receipts Express for Travel Expense Filing

> **Status: PROPOSAL.** This document proposes a departmental pilot. It is
> not an approved, endorsed, or production system for any organization,
> and it is pending whatever governance review process your organization
> requires before adopting a new tool. Nothing here should be read as
> FedEx approval, endorsement, or affiliation — Receipts Express is an
> independent personal project (see the README's
> [Disclaimer & Data Guidance](../README.md#disclaimer--data-guidance)
> section).
>
> Structured after the [AI Pilot Program
> Template](https://github.com/arigatoexpress/AI-Efficiency/blob/main/docs/pilot-program-template.md)
> from the FedEx AI Efficiency Hub
> ([arigatoexpress/AI-Efficiency](https://github.com/arigatoexpress/AI-Efficiency)) —
> credit to that project for the governance framework this proposal is
> formatted against.
>
> **Pilot Slide Decks**:
> * **[Interactive Presentation Deck (HTML)](./pilot-deck.html)**: A rich, animated web slideshow for meetings and sharing.
> * **[GitHub Presentation Version (Markdown)](./PILOT_DECK.md)**: A quick-read text format for viewing directly in the repository.

## 1. Pilot Overview

| Field | Proposed Answer |
| --- | --- |
| **Pilot name** | Receipts Express — standardized receipt-to-PDF capture |
| **Owner** | TBD — proposing department's pilot sponsor |
| **Backup owner** | TBD |
| **Start / End date** | TBD, pending governance approval |
| **Station / Region / Hub** | TBD — proposed for a single department or team first |
| **Problem statement** | Travel expense filing is slow and error-prone when receipts are kept loose (paper or camera roll) until trip's end, then manually reconstructed into a report. |
| **Current process** | Employee collects paper or photo receipts during travel, then at trip's end — often days or weeks later — manually transcribes merchant, date, and amount for each into whatever expense system the organization uses. |
| **Proposed use case** | Employee scans each receipt with Receipts Express as it's incurred — by camera photo, or by uploading a PDF (single- or multi-page, e.g. an emailed invoice); the app extracts merchant/date/total via on-device OCR for the employee to review; at trip's end, the employee exports one polished PDF (or CSV) covering the whole trip and attaches it to their organization's actual expense system. Receipts Express does not replace or integrate with any expense or fiscal system — it standardizes and speeds up the capture step that happens before that system. |

## 2. Audience and Scope

| Field | Proposed Answer |
| --- | --- |
| **Primary users** | Employees who travel and file expense reports |
| **Secondary beneficiaries** | Whoever reviews or processes those expense reports downstream |
| **In scope** | Receipt capture, OCR-assisted data entry, report organization, PDF/CSV export |
| **Out of scope** | Reimbursement, approval workflows, integration with any expense or fiscal system, any data leaving the employee's device |

## 3. Data and Tools

| Field | Proposed Answer |
| --- | --- |
| **Data sources** | Real personal/financial data — receipt images and the merchant, date, and amount extracted from them. Not public or synthetic data. |
| **Data classification** | Confidential. Processed and stored exclusively on-device, never transmitted — see [SECURITY.md](../SECURITY.md) for the full classification and how it's enforced (including by a Content-Security-Policy, not just written policy). |
| **AI tool** | On-device OCR only (self-hosted Tesseract.js). PDF receipts are rasterized on-device the same way (self-hosted PDF.js) before OCR runs. No cloud AI vendor, no API calls, nothing sent off-device for processing. |
| **Tool approval status** | Not yet reviewed by any organization's governance process — this document is the proposal to start that review. |
| **Data retention** | Indefinite, but exclusively in the employee's own browser storage (IndexedDB), until they delete it or export and remove it themselves. See the durability note in [SECURITY.md](../SECURITY.md) — this is a capture-and-export tool, not an archive. |
| **Access controls** | Device-level only — whoever has access to the employee's own browser profile. No server, no shared storage, no administrative visibility into any user's data. |

## 4. Expected Benefit

| Metric | Current State | Target State | How Measured |
| --- | --- | --- | --- |
| Time to file after trip end | Not yet baselined | Reduced | Proposed: track days from trip-end to report-filed for pilot participants against a comparable baseline group |
| User-reported friction | Not yet baselined | Reduced | Proposed: short participant survey at pilot end |

These are proposed measures to be baselined during a pilot, not results — this project has not run a pilot and has no outcome data to report yet.

**Success criteria:** to be defined jointly with the pilot's governance reviewer before start, based on the baseline established above.

**Failure / stop condition:** to be defined the same way — this proposal does not presume them ahead of a baseline.

## 5. Governance and Review

| Field | Proposed Answer |
| --- | --- |
| **Reviewer / approver** | TBD — whoever the proposing organization designates |
| **Legal / compliance review needed?** | Yes — recommended, given real personal/financial data is involved |
| **IT security review needed?** | Yes — recommended. [SECURITY.md](../SECURITY.md) and this repository's CI posture (dual gates, SHA-pinned supply chain, branch protection — see the README's [Security posture](../README.md#security-posture) section) are provided as a starting point for that review, not a substitute for it |
| **HR review needed?** | TBD, per organization policy |
| **Demo date** | TBD |
| **Go / No-Go decision date** | TBD |

---

*This is a proposal document only. No pilot is underway.*
