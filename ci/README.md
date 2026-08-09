# CI System

## Division of responsibility

| System | Owns |
|---|---|
| GitHub Actions (`.github/workflows/deploy.yml`) | typecheck, tests, `npm audit` (blocking at `high`), GitHub Pages deploy |
| Jenkins (`Jenkinsfile`) | secrets scanning, SAST, workflow auditing, Dockerfile linting, supply-chain scanning, and (main-branch-only) full-history secrets scanning + SBOM generation |

Neither pipeline duplicates the other's stages.

## Pipeline stages

Every stage below runs on every Jenkins build of a branch unless marked **main-only** — the `Jenkinsfile` gates those two with `when { branch 'main' }`.

A build is not triggered by the push. The controller is reachable only over the tailnet, so GitHub cannot deliver a webhook to it; a build starts when the multibranch job scans the repository, which is why **Scan Repository Now** is a step in the working rhythm below.

| Stage | Tool | Version | What it checks |
|---|---|---|---|
| Secrets scan | [gitleaks](https://github.com/gitleaks/gitleaks) | 8.30.1 | Working tree, against `.gitleaks.toml` (default ruleset + this repo's custom privacy rules — see below) |
| SAST | [semgrep](https://semgrep.dev/) | 1.170.0 | `p/default`, `p/typescript`, `p/react`, `p/owasp-top-ten` rulesets, metrics off |
| Workflow audit | [zizmor](https://github.com/zizmorcore/zizmor) | 1.27.0 | `.github/workflows/` for Actions supply-chain/permissions issues |
| Dockerfile lint | [hadolint](https://github.com/hadolint/hadolint) | 2.14.0 | `ci/agent/Dockerfile` |
| Supply chain | [osv-scanner](https://github.com/google/osv-scanner) | 2.4.0 | `package-lock.json` against the OSV vulnerability database |
| Secrets scan (full history) — **main-only** | gitleaks | 8.30.1 | Every commit ever pushed to `main` (`gitleaks git . --redact`), not just the working tree |
| SBOM — **main-only** | [syft](https://github.com/anchore/syft) | 1.48.0 | Generates a CycloneDX SBOM (`sbom.json`) for the repo, archived as a Jenkins build artifact |

The full-history secrets scan and SBOM generation are main-only because both are about the state of `main` as a whole (and are slower) rather than about vetting an individual change before merge — the working-tree secrets scan on every PR already catches new leaks before they land.

### Gitleaks configuration

- `.gitleaks.toml` extends gitleaks' built-in ruleset (`useDefault = true`) with three custom rules tagged `privacy`/`pii`: a macOS `/Users/<name>` path, an email-like string on a `.local` hostname, and an absolute `file://` URI. These exist because a public repo leaking a contributor's local username or hostname is a real finding here, not just credential/token secrets. Each rule was validated against the pre-scrub content of `docs/governance/REVIEW.md` as a known-positive fixture before being added.
- `.gitleaksignore` suppresses the specific historical fingerprints from that same incident (commit `f8eaec7`) — the file itself was fixed going forward, but git history was deliberately left unrewritten (a force-push rewrite would break every existing clone/fork over a non-secret, low-severity leak), so the full-history scan needs those exact fingerprints allowlisted to stay green rather than failing forever on already-handled history. Any *new* finding — including a new occurrence of the same pattern elsewhere — still fails the build.
- `.gitleaks.toml` also has an `android-keystore-file` rule (tagged `android`/`signing`/`critical`), added ahead of the upcoming TWA/APK work as a structural backstop: it matches on *filename*, not content (`*.jks`, `*.keystore`, `key.properties`, `keystore.properties`), since keystores are binary and their contents can't be reliably pattern-matched. `.gitignore` is the first line of defense against ever adding these files; this rule catches it anyway if `.gitignore` is ever bypassed (e.g. `git add -f`). Validated against a scratch fixture (all four filenames flagged) and against near-miss names like `key.properties.example` and `notes-about-jks.md` (correctly *not* flagged, confirming the `$` anchor).

### Dockerfile lint exceptions

`ci/agent/Dockerfile` carries two annotated `hadolint ignore=` comments, each with an inline reason at the point of use:

- **DL3008** (pin apt package versions) on the `git`/`curl`/`python3-pip` install — left unpinned deliberately. Debian apt version pinning is brittle across the mirror/snapshot lifecycle (a pinned version can vanish from the mirror before the next rebuild), and these three are base-layer plumbing, not security-sensitive scan tools. Every actual scan tool below them *is* pinned, individually, by its own `ARG`.
- **DL3059** (consolidate consecutive `RUN` instructions) on the zizmor install — left as separate layers deliberately, so bumping one tool's version only invalidates and re-downloads that tool's layer on rebuild, not every tool's.

`semgrep`, previously installed unpinned, now has its own `ARG SEMGREP_VERSION` like every other tool (this was hadolint's DL3013 finding on first run — a legitimate catch, not an exception).

## Windows host operations

```
docker start jenkins jenkins-agent
docker stop jenkins jenkins-agent
```

All state (job config, build history, workspace) persists in the `jenkins_home` and `agent_work` named volumes — stopping/starting the containers does not lose anything. Provisioning details: `ci/blade-setup.ps1`.

## Working rhythm

1. Start containers (`docker start jenkins jenkins-agent`)
2. Push branch, open PR
3. In Jenkins: **Scan Repository Now**
4. Review both required checks on the PR
5. Merge on green
6. Stop containers (`docker stop jenkins jenkins-agent`)

## Branch protection facts

`main` requires a PR plus two status checks, strict mode (branch must be up to date), enforced for admins:

- `test` — GitHub Actions app (`app_id: 15368`)
- `continuous-integration/jenkins/pr-merge` — classic Status API (no app binding)

`build` and `deploy` are **not** required — they `skip` on PRs by design (deploy-only-on-`main`-push gate), and requiring them would deadlock every merge. The two main-only Jenkins stages (full-history secrets scan, SBOM) are likewise not required on PRs, for the same reason — they only ever run on `main` pushes/rescans, never on a PR build.

## Firewall verification test

- From a non-Tailscale device on the LAN: `http://<blade-lan-ip>:8080` must be **unreachable**.
- From a Tailscale (tailnet) device: it must load.

## Update procedures

- **Jenkins controller**: `docker pull jenkins/jenkins:lts-jdk21`, recreate the `jenkins` container. Volumes preserve all state.
- **Jenkins agent**: on tool bumps (gitleaks/semgrep/zizmor/osv-scanner/hadolint/syft versions in `ci/agent/Dockerfile`), rebuild the image and recreate the `jenkins-agent` container.
- **GitHub PAT**: rotates at its 90-day expiry.

## Escape hatch

If the Jenkins host is unavailable, temporarily remove `continuous-integration/jenkins/pr-merge` from the required checks in branch protection so GitHub-Actions-only PRs can still merge. Do this deliberately, and revert it once Jenkins is back.

## First-catch note

On its inaugural runs, this pipeline first flagged mutable action tags (`@v4`, `@v5`, etc.) in the Actions workflow as a supply-chain risk, then flagged the missing cooldown period in the Dependabot config added to fix that. Both were remediated: full 40-character commit SHA pins (with the human-readable version kept as a trailing comment) plus a 7-day cooldown in `.github/dependabot.yml`.

Its full-history secrets scan then caught a local-machine email, `.local` hostname, and `file://` path leaked in `docs/governance/REVIEW.md` back when it was first added — see the Gitleaks configuration section above for how that was fixed and allowlisted.
