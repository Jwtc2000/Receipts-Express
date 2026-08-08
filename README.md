# Receipts Express

[![Build, test, and deploy](https://github.com/Jwtc2000/Receipts-Express/actions/workflows/deploy.yml/badge.svg)](https://github.com/Jwtc2000/Receipts-Express/actions/workflows/deploy.yml)

Scan receipts, organize expense reports, and export polished PDFs — all in your browser, all on your device.

Receipts Express is a **Progressive Web App (PWA)**: it runs on iOS, Android, and desktop from a single codebase, can be installed to your home screen like a native app, and keeps working offline. No accounts, no servers — every receipt stays on your device.

---

## Pilot Program & Presentations

If you are a co-worker looking to help pilot Receipts Express, check out the following resources:
* **[Pilot Proposal (docs/PILOT.md)](./docs/PILOT.md)**: Standardized capture proposal for departments.
* **[Interactive Slide Deck (docs/pilot-deck.html)](./docs/pilot-deck.html)**: Interactive presentation slideshow for team meetings.
* **[Slide Deck Content (docs/PILOT_DECK.md)](./docs/PILOT_DECK.md)**: Markdown version of the presentation deck.
* **[Project Governance Review (docs/governance/REVIEW.md)](./docs/governance/REVIEW.md)**: Compliance checklist based on corporate templates.
* **[Privacy Policy (docs/privacy.html)](./docs/privacy.html)**, **[Terms of Use (docs/terms.html)](./docs/terms.html)**, and **[Consumer Health Data Privacy Policy (docs/consumer-health-data.html)](./docs/consumer-health-data.html)**: The user-facing legal pages, linked from the app under Menu → About and acknowledged once on first launch.

---

## Welcome to GitHub

If you are new here, you might be wondering where you have landed. Here is a simple guide to what this page is and the tools we use:

* **What is GitHub?**: GitHub is a secure, cloud-based filing cabinet (code hosting platform) where developers store, share, and collaborate on software projects. You are currently looking at the main web interface for this project.
* **What is a Repository (Repo)?**: A repository is a project folder containing all the code files, assets, documentation, and the complete history of every change ever made to the project.
* **What is Git?**: Git is the underlying system (version control system) running behind the scenes. Think of it as a time machine for files. It takes snapshots of the project as it changes, allowing developers to track changes, see who made them, and revert to older versions if something breaks.
* **What is a Branch?**: A branch is an isolated playground (development sandbox). Developers create a branch to edit files or add features without messing up the working, live version of the software. Once the changes are tested, they are merged back into the main branch (the `main` line of code).
* **What is a Pull Request (PR)?**: A pull request is a request to merge changes from a separate branch into the main branch. It is a digital meeting room where other developers review the new code, discuss edits, and approve them before they are officially merged.
* **What is CI/CD (Continuous Integration/Continuous Deployment)?**: Think of this as an automated quality inspector. Every time a developer submits changes (a pull request), automatic scripts run to verify that the app still compiles, all automated tests pass, and no security issues exist before allowing the code to be merged.

---

## Why This Exists

Expense reports get filed late because filing them is tedious: receipts pile up loose — paper or camera-roll photos — until the trip is over, and then someone has to sit down and reconstruct merchants, dates, and totals from a stack of faded thermal paper. Receipts Express is built to make that fast and frictionless enough that reports actually get filed on time: scan each receipt as you go, organize them into a report as the trip happens, and export one polished PDF at the end, ready to hand to whatever fiscal or expense system your organization uses. That's the goal the app is designed around.

---

## The Problem with the Alternatives

Most free receipt-scanner apps are ad-supported products. Their advertising toolkits (ad SDKs) are third-party code with their own data-sharing arrangements, they're known for showing intrusive or misleading ads, and the personal financial data flowing through them — receipts, which often carry partial card numbers and reveal exactly where and when you traveled — passes through servers (external cloud infrastructure) nobody outside the vendor has ever independently vetted. That's a bad trade for data this sensitive.

---

## Features

* <img src="./assets/camera.svg" width="18" height="18" align="center" /> **Scan receipts with your camera, or upload a photo or PDF** — single-page and multi-page PDF receipts are both supported, rasterized on-device page by page. On-device text recognition (Tesseract.js OCR) automatically extracts the merchant, date, and total — you just review and adjust.
* <img src="./assets/reports.svg" width="18" height="18" align="center" /> **Multiple expense reports**, each with its own timeline of expenses.
* <img src="./assets/reorder.svg" width="18" height="18" align="center" /> **Reorganize freely** — drag expenses to reorder them on the timeline (or use the arrow buttons on mobile), and move expenses between reports.
* <img src="./assets/pdf.svg" width="18" height="18" align="center" /> **One-tap PDF export** — a summary page listing every expense with the grand total, followed by a full page for each receipt image (one page per page, for multi-page PDF receipts), with the expense's title and details shown once, beneath the last page.
* <img src="./assets/lock.svg" width="18" height="18" align="center" /> **Private by design** — everything is stored in your browser's secure sandbox database (IndexedDB). Nothing leaves your device.

---

## Security Posture

Every claim below is something you can verify by reading this repository, not something you have to take on faith:

* **On-device-only processing and storage.** See [SECURITY.md](./SECURITY.md) for the full data classification.
* **No exfiltration, enforced by a Content-Security-Policy (CSP)** — not just promised. `connect-src 'self'` means the browser itself blocks any script from reaching any network destination other than this app's own origin, regardless of what a compromised dependency might try. [`src/csp.test.ts`](./src/csp.test.ts) asserts every production build carries the policy.
* **Self-hosted text recognition (OCR).** Tesseract.js's engine, WebAssembly (WASM) core, and language data are bundled and served from this app's own origin — it never calls an external content delivery network (CDN).
* **Dual Continuous Integration (CI).** GitHub Actions runs typecheck, tests, and a blocking security vulnerability audit (`npm audit`); a separate Jenkins pipeline runs secrets scanning (gitleaks) and static application security testing (SAST via semgrep) on its own agent infrastructure. See [ci/README.md](./ci/README.md).
* **SHA-pinned supply chain.** Every GitHub Action is pinned to a full commit cryptographic hash (SHA) rather than a mutable tag, with Dependabot on a 7-day cooldown before it proposes an update.
* **Branch protection on `main`**, requiring both CI systems to pass before anything merges.
* **[Apache-2.0](./LICENSE)** license.

---

## Continuous Integration & Deployment (CI/CD)

**In plain terms:** every time code is pushed or a pull request is opened, two independent automated systems inspect it before it's allowed anywhere near the live app. One lives on GitHub's own servers and handles "does it work" (does it compile, do the tests pass, is the deploy safe to run). The other lives on a private machine and handles "is it safe" (no leaked secrets, no risky code patterns, no vulnerable dependencies). Both have to say yes before a change can merge into `main`; if either says no, the merge is blocked.

**In technical terms:** the two pipelines are deliberately non-overlapping — neither repeats a check the other already owns. Full reasoning and configuration notes live in [ci/README.md](./ci/README.md); the summary below is what each one runs.

### GitHub Actions — [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

Hosted on GitHub's own runners. Every Action is pinned to a full 40-character commit SHA (not a mutable version tag like `@v4`), and Dependabot proposes updates to those pins weekly with a 7-day cooldown before a new release is trusted.

| Job | Runs on | What it does |
| --- | --- | --- |
| **`test`** | Every push to `main` and every pull request | Checks out the code, installs dependencies (`npm ci`), then runs `npm run typecheck` (TypeScript type checking), `npm test` (the Vitest test suite), and `npm audit --audit-level=high` (fails the build if any dependency has a known high-or-worse severity vulnerability). |
| **`build`** | Only a push to `main`, or a manual run (`workflow_dispatch`) | Runs `npm run build` to compile the production bundle, then hands it to GitHub Pages' `configure-pages`/`upload-pages-artifact` actions. Never runs on PRs or feature branches, so in-progress work can never reach the live site. |
| **`deploy`** | Same restriction as `build`, and only after `build` succeeds | Publishes the built artifact to GitHub Pages using GitHub's official `deploy-pages` action, with `id-token: write` permission scoped to just this job. |

Permissions are minimal by default (`contents: read` at the workflow level), each job only gains the extra permission it needs, and `persist-credentials: false` on checkout means the GitHub token never lingers after the checkout step. Concurrency groups cancel superseded runs of the same job on the same ref, and Pages deploys are serialized so two deploys can never race each other.

### Jenkins — [`Jenkinsfile`](./Jenkinsfile)

Hosted on a separate, self-hosted machine (reachable only over a private Tailscale network, not the public internet), running the same checks on every push and PR unless noted as main-only:

| Stage | Tool | What it checks |
| --- | --- | --- |
| **Secrets scan** | [gitleaks](https://github.com/gitleaks/gitleaks) | Scans the working tree for accidentally committed credentials, tokens, and (via this repo's custom rules) contributor-identifying paths/hostnames. |
| **SAST** *(Static Application Security Testing)* | [semgrep](https://semgrep.dev/) | Pattern-matches the TypeScript/React source against known-bad code patterns, including the OWASP Top Ten. |
| **Workflow audit** | [zizmor](https://github.com/zizmorcore/zizmor) | Audits `.github/workflows/` itself for supply-chain and permissions issues — auditing the auditor, in effect. |
| **Dockerfile lint** | [hadolint](https://github.com/hadolint/hadolint) | Lints the Jenkins agent's own `ci/agent/Dockerfile` for unsafe or wasteful Docker practices. |
| **Supply chain** | [osv-scanner](https://github.com/google/osv-scanner) | Checks every dependency in `package-lock.json` against the OSV (Open Source Vulnerabilities) database. |
| **Secrets scan (full history)** — *main-only* | gitleaks | Scans every commit ever pushed to `main`, not just the current working tree — slower, so it's reserved for main rather than every PR. |
| **SBOM** — *main-only* | [syft](https://github.com/anchore/syft) | Generates a CycloneDX Software Bill of Materials listing every dependency, archived as a build artifact. |

Branch protection on `main` requires **both** systems to report success before a merge is allowed: GitHub Actions' `test` job, and Jenkins' `continuous-integration/jenkins/pr-merge` status check. Neither `build` nor `deploy` is a required check, since both intentionally skip on PRs — requiring them would deadlock every merge.

---

## How It Works Under the Hood

| Component | Technology | In Plain Terms |
| --- | --- | --- |
| **User Interface (UI)** | React 18 + TypeScript + Vite | **React** handles rendering the screens and components; **TypeScript** is a programming language that catches bugs early by checking code types; **Vite** is a packager (build tool) that compiles files for the web. |
| **Receipt OCR** | Tesseract.js (runs fully in-browser) | An offline engine that runs in-browser to transcribe text out of pictures using **WebAssembly (WASM)**, which lets native binary code run fast in the browser. |
| **PDF Receipt Rasterization** | PDF.js (runs fully in-browser) | Converts an uploaded PDF receipt into one image per page on-device, so it flows through the same OCR/storage/export path as a photographed receipt. |
| **Storage** | IndexedDB via `idb` | A secure local database inside your browser that holds reports, expenses, and receipt images. |
| **PDF Export** | jsPDF | A library that packages receipt details and images into a PDF file entirely on your machine. |
| **Offline Support** | `vite-plugin-pwa` service worker + manifest | Technology that allows the app to be installed onto your home screen and run offline without an internet connection (**Progressive Web App**). |

The text recognition engine (worker, WASM core, English language data) is **self-hosted**: the build process copies it from the program's library folder (`node_modules`) into the public distribution folder (`public/tesseract/`) automatically, so the app never calls a CDN and scanning works fully offline once the app has loaded. The PDF rasterization engine (PDF.js's worker, WASM codecs, standard fonts, and color profiles) is self-hosted the same way, into `public/pdfjs/` — see [`scripts/copy-pdfjs-assets.mjs`](./scripts/copy-pdfjs-assets.mjs).

---

## Getting Started

If you are a developer looking to run this project locally, execute the following commands in your command-line interface (terminal):

> [!WARNING]
> **Local Development CSP Bypass & Data Privacy**: 
> In local development mode (`npm run dev`), the Content-Security-Policy (CSP) is bypassed to allow hot-reloading (HMR) of styling files. Therefore, browser-level network exfiltration blocks are NOT active in development mode.
> 
> **Never load or scan real corporate/personal receipt data when running the app locally in development mode.** Always use mock/synthetic receipts for testing features locally. For end-to-end testing with real files, build and run the production package locally using `npm run build` and `npm run preview` (where the full CSP is active).

1. **Install dependencies**: Downloads all the external libraries the app needs to run.
   ```bash
   npm install
   ```
2. **Start local dev server**: Spins up a local web server so you can view and test the application in your browser.
   ```bash
   npm run dev
   ```
3. **Build production bundle**: Compiles and optimizes the app into a `dist/` directory ready to be deployed to any static host.
   ```bash
   npm run build
   ```
4. **Preview production build**: Serves the compiled production code locally to test it before deploying.
   ```bash
   npm run preview
   ```
5. **Typecheck code**: Runs TypeScript's compiler to verify there are no syntax or type errors.
   ```bash
   npm run typecheck
   ```
6. **Run tests**: Executes the test runner (Vitest) to verify that all code behaves correctly.
   ```bash
   npm test
   ```

Open the dev server URL on your phone (same network) or deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages, …). **Camera access requires HTTPS** (or localhost), so use a proper host or a tunneling tool when testing on a phone.

---

## Install as an App

* **iOS (Safari):** Share → *Add to Home Screen*
* **Android (Chrome):** Menu → *Install app*

---

## Disclaimer & Data Guidance

This is a personal project, built and maintained independently. It has no affiliation with, endorsement from, or approval by FedEx, and it is not a production system operated by or for any organization.

By design, all receipt data — images, extracted text, and report contents — stays on your device (see [SECURITY.md](./SECURITY.md) for exactly how). Exported PDFs, once you save or share them, are your responsibility to handle according to your own organization's data-handling rules — this app has no visibility into, or control over, what happens to a file after it leaves the app.

The user-facing versions of these commitments are published as three standalone pages, linked from the app under Menu → About. New users acknowledge the first two once, on first launch, before using the app:

* **[Privacy Policy (docs/privacy.html)](./docs/privacy.html)** — what is stored on your device, what is never collected, and the one network interaction that exists.
* **[Terms of Use (docs/terms.html)](./docs/terms.html)** — no affiliation, Apache-2.0 licensing, as-is with no warranty, Washington governing law, and what you're responsible for.
* **[Consumer Health Data Privacy Policy (docs/consumer-health-data.html)](./docs/consumer-health-data.html)** — a separate, distinctly-linked page, because Washington's My Health My Data Act treats that link as its own requirement and a scanned pharmacy receipt is the kind of thing it contemplates.

Every claim in the Privacy Policy is traceable to code in this repository. All three pages are deliberately self-contained — no external fonts, scripts, or styles — and so is the pilot deck, which used to load its fonts from Google's CDN. [`src/legalPages.test.ts`](./src/legalPages.test.ts) enforces that for all four, and also checks that the localStorage keys the policy enumerates are still the ones the app writes.

These pages are not a substitute for legal advice, and they have not been reviewed by an attorney.

## Versioning

The app's version lives in `package.json` (semver) and is shown in the app under Menu → About. See [CHANGELOG.md](./CHANGELOG.md) for release notes — bump the version there whenever a change lands on `main`.
