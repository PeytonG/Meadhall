# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/PeytonG/Meadhall/security/advisories/new)
("Report a vulnerability" on the Security tab). Include what you found, how to reproduce it, and what an
attacker could do with it. You should get a reply within a week.

Problems in the Matrix protocol, Synapse, Element Call or LiveKit belong with those projects; if you're not sure,
report here and we'll forward it.

## Supported versions

Only the latest release gets security fixes. The desktop app updates itself; Android users should install the
newest APK from [Releases](https://github.com/PeytonG/Meadhall/releases).

## How Meadhall is protected

- **End-to-end encryption** for messages (Matrix Rust crypto) and for voice in encrypted rooms (MatrixRTC media
  keys exchanged over encrypted to-device messages).
- **Desktop hardening:** sandboxed renderer with context isolation and no Node integration; renderer permissions
  limited to microphone/camera, notifications, clipboard writes and fullscreen, and only for the app itself;
  external links open in the system browser with an allowlist of URL schemes; Electron fuses disable running as
  Node and enforce ASAR integrity.
- **Content Security Policy** in the web app; fonts and scripts are served locally.
- **Automated scanning** (`.github/workflows/security.yml`): CodeQL, dependency review on pull requests, gitleaks
  over the full git history, `pnpm audit` (fails on high/critical advisories) and Electronegativity, on every
  change and weekly. Dependabot raises update and security PRs. GitHub Actions are pinned to commit SHAs and
  workflows run with read-only tokens unless a job needs more.

## Running the audits locally

```bash
pnpm audit
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.1 git /repo --redact
npm_config_ignore_scripts=true npx @doyensec/electronegativity@1.10.3 -i apps/desktop/electron -e 44.9.3
```

## Last audit (2026-10-22)

| Check | Result |
|---|---|
| `pnpm audit` | 140 advisories before the audit (Electron 34, Vite, Vitest, electron-builder's dependencies, sharp). After upgrading Electron to 44.9.3, Vite 6.4.5, Vitest 4.1, electron-builder 26.15, sharp 0.35.5 and overriding three build-time transitive packages: **1 moderate** left (below). |
| gitleaks | No secrets in any commit. |
| Electronegativity | 4 findings. `AUXCLICK_JS_CHECK` fixed (`disableBlinkFeatures: "Auxclick"`). `CSP_GLOBAL_CHECK` is a false positive (the CSP is in `apps/web/index.html`, outside the scanned folder). `PRELOAD_JS_CHECK` and `OPEN_EXTERNAL_JS_CHECK` reviewed: the preload exposes only narrow `contextBridge` functions, and `openExternal` only allows http, https, mailto and matrix URLs. |

### Accepted risks

- `sprintf-js` (moderate, no patched release exists): pulled in by `@electron/get` → `global-agent`, which only
  runs on the build machine while downloading Electron. It is never shipped in the app.
