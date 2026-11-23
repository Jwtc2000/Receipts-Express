# CI System

## Division of responsibility

| System | Owns |
|---|---|
| GitHub Actions (`.github/workflows/deploy.yml`) | typecheck, tests, `npm audit` (blocking at `high`), GitHub Pages deploy |
| Jenkins (`Jenkinsfile`) | commit-identity check, secrets scanning (working tree and history), SAST, workflow auditing, Dockerfile linting, supply-chain scanning, and (main-branch-only) SBOM generation |

The two overlap in one place, on purpose: `npm audit` in GitHub Actions and osv-scanner in Jenkins both check the lockfile for known vulnerabilities, against different databases. GitHub Actions also runs `test` once a day on a schedule, so a new advisory against a dependency already on `main` is noticed without a push.

## Pipeline stages

Every stage below runs on every Jenkins build unless marked **PR-only** or **main-only**.

Builds start on their own shortly after a push. A build is limited to 20 minutes, a newer push to the same branch cancels the build of the older one, and the workspace is deleted afterwards.

| Stage | Tool | Version | What it checks |
|---|---|---|---|
| Commit identity — **PR-only** | git | — | Every commit the pull request adds has GitHub no-reply author and committer addresses. Fails without printing the address |
| Secrets scan | [gitleaks](https://github.com/gitleaks/gitleaks) | 8.30.1 | Working tree, against `.gitleaks.toml` (default ruleset + this repo's custom privacy rules — see below) |
| SAST | [semgrep](https://semgrep.dev/) | 1.170.0 | `p/default`, `p/typescript`, `p/react`, `p/owasp-top-ten` rulesets, metrics off |
| Workflow audit | [zizmor](https://github.com/zizmorcore/zizmor) | 1.27.0 | `.github/workflows/` for Actions supply-chain/permissions issues |
| Dockerfile lint | [hadolint](https://github.com/hadolint/hadolint) | 2.14.0 | `ci/agent/Dockerfile` |
| Supply chain | [osv-scanner](https://github.com/google/osv-scanner) | 2.4.0 | `package-lock.json` against the OSV vulnerability database |
| Secrets scan (history) | gitleaks | 8.30.1 | Every commit reachable in the checkout (`gitleaks git . --redact`), not just the working tree. On a pull request that includes the commits it adds |
| SBOM — **main-only** | [syft](https://github.com/anchore/syft) | 1.48.0 | Generates a CycloneDX SBOM (`sbom.json`) for the repo, archived as a Jenkins build artifact |

SBOM generation is main-only because it describes the state of `main` as a whole. The history scan used to be main-only too. It now runs on every build, because the working-tree scan cannot see a secret that one commit of a pull request adds and a later one removes: squash-merging keeps those commits out of `main`, so a main-only history scan never saw them either, while they stay public through the pull request.

### Gitleaks configuration

- `.gitleaks.toml` extends gitleaks' built-in ruleset (`useDefault = true`) with three custom rules tagged `privacy`/`pii`: a macOS `/Users/<name>` path, an email-like string on a `.local` hostname, and an absolute `file://` URI. These exist because a public repo leaking a contributor's local username or hostname is a real finding here, not just credential/token secrets. Each rule was validated against the pre-scrub content of `docs/governance/REVIEW.md` as a known-positive fixture before being added.
- `.gitleaksignore` suppresses the specific historical fingerprints from that same incident (commit `f8eaec7`) — the file itself was fixed going forward, but git history was deliberately left unrewritten (a force-push rewrite would break every existing clone/fork over a non-secret, low-severity leak), so the full-history scan needs those exact fingerprints allowlisted to stay green rather than failing forever on already-handled history. Any *new* finding — including a new occurrence of the same pattern elsewhere — still fails the build.
- `.gitleaks.toml` also has an `android-keystore-file` rule (tagged `android`/`signing`/`critical`), added ahead of the upcoming TWA/APK work as a structural backstop: it matches on *filename*, not content (`*.jks`, `*.keystore`, `key.properties`, `keystore.properties`), since keystores are binary and their contents can't be reliably pattern-matched. `.gitignore` is the first line of defense against ever adding these files; this rule catches it anyway if `.gitignore` is ever bypassed (e.g. `git add -f`). Validated against a scratch fixture (all four filenames flagged) and against near-miss names like `key.properties.example` and `notes-about-jks.md` (correctly *not* flagged, confirming the `$` anchor).

### Dockerfile lint exceptions

`ci/agent/Dockerfile` carries two annotated `hadolint ignore=` comments, each with an inline reason at the point of use:

- **DL3008** (pin apt package versions) on the `git`/`curl`/`python3-pip` install — left unpinned deliberately. Debian apt version pinning is brittle across the mirror/snapshot lifecycle (a pinned version can vanish from the mirror before the next rebuild), and these three are base-layer plumbing, not security-sensitive scan tools. Every actual scan tool below them *is* pinned, individually, by its own `ARG`.
- **DL3059** (consolidate consecutive `RUN` instructions) on the zizmor install — left as separate layers deliberately, so bumping one tool's version only invalidates and re-downloads that tool's layer on rebuild, not every tool's.

`semgrep`, previously installed unpinned, now has its own `ARG SEMGREP_VERSION` like every other tool (this was hadolint's DL3013 finding on first run — a legitimate catch, not an exception).

## Working rhythm

1. Push branch, open PR
2. Review both required checks on the PR
3. Merge on green

## Branch protection facts

`main` requires a PR plus two status checks, strict mode (branch must be up to date), enforced for admins:

- `test` — GitHub Actions app (`app_id: 15368`)
- `continuous-integration/jenkins/pr-merge` — classic Status API (no app binding)

`build` and `deploy` are **not** required — they `skip` on PRs by design (deploy-only-on-`main`-push gate), and requiring them would deadlock every merge. The main-only SBOM stage is likewise not part of what a PR build proves.

## First-catch note

On its inaugural runs, this pipeline first flagged mutable action tags (`@v4`, `@v5`, etc.) in the Actions workflow as a supply-chain risk, then flagged the missing cooldown period in the Dependabot config added to fix that. Both were remediated: full 40-character commit SHA pins (with the human-readable version kept as a trailing comment) plus a 7-day cooldown in `.github/dependabot.yml`.

Its full-history secrets scan then caught a local-machine email, `.local` hostname, and `file://` path leaked in `docs/governance/REVIEW.md` back when it was first added — see the Gitleaks configuration section above for how that was fixed and allowlisted.
