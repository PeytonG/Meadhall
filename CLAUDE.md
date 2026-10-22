# Meadhall — Project Guide (CLAUDE.md)

> The single source of truth for **AI agents and human maintainers** working on Meadhall: what it is, how to work
> on it, every significant decision and *why* it was made, known pitfalls, current status and the work log.

| | |
|---|---|
| **Repository** | [github.com/PeytonG/Meadhall](https://github.com/PeytonG/Meadhall) (public, standalone) |
| **Owner** | PeytonG |
| **Upstream** | Fork of [Vitosicz/Heorot](https://github.com/Vitosicz/Heorot) (git remote `upstream`) |
| **License** | AGPL-3.0 (inherited from Heorot and Element; cannot be changed) |
| **Latest release** | `v0.1.0` (first release, 2026-10-22) |
| **Last updated** | 2026-10-22 |

> **Upkeep rule (from the owner):** update this file after every few completed tasks, before context runs low, and
> whenever a non-obvious decision is made. Keep it professional. Commit it with the work it describes.

## Contents

1. [Overview](#1-overview)
2. [Repository layout](#2-repository-layout)
3. [Commands](#3-commands)
4. [Working agreements](#4-working-agreements)
5. [License rules](#5-license-rules-agpl-30)
6. [Compatibility identifiers](#6-compatibility-identifiers-do-not-rename)
7. [Architecture decisions](#7-architecture-decisions)
8. [Gotchas](#8-gotchas)
9. [Status](#9-status)
10. [Open issues and roadmap](#10-open-issues-and-roadmap)
11. [Work log](#11-work-log)

## 1. Overview

Meadhall is a self-hosted, Discord-style [Matrix](https://matrix.org) client with a pixel-art look: spaces are
servers, rooms are channels, voice channels are persistent hangouts. It ships as a web app, an Electron desktop app
(Windows, Linux; macOS unsigned) and an Android app (Capacitor). Voice uses MatrixRTC with LiveKit, so calls are
shared with Element Call users.

## 2. Repository layout

| Path | Contents |
|---|---|
| `apps/web/` | The client: React 19, Vite, matrix-js-sdk 40.2 (Rust crypto WASM), livekit-client |
| `apps/web/src/core/` | Matrix infrastructure: config, session lifecycle, storage, voice (`matrixRtc.ts`), import, stores |
| `apps/web/src/ui/` | React UI. `theme/` = accent engine + pixel color wheel; `styles/pixel.css` = pixel look; `stickers/` |
| `apps/web/test/` | `unit-tests/`, `smoke-tests/` (jsdom), `integration/` (Node + real Synapse) |
| `apps/web/e2e/` | Playwright tests, screenshot capture (`screenshots.spec.ts`), `serve.mjs` |
| `apps/desktop/` | Electron: `main`, `preload`, `tray`, `updater`, `loginItem`, `permissions`; electron-builder configs |
| `apps/mobile/` | Capacitor 8 Android app; `android/` is the generated, committed Gradle project |
| `branding/` | Source artwork (`meadhall-icon.jpg`, `meadhall-hall.jpg`) |
| `scripts/` | `test-synapse.mjs`, `generate-branding.mjs`, `generate-stickers.mjs` |
| `docs/` | `self-hosting.md`, `screenshots/`, `stickers-sheet.png` |
| `.github/` | Workflows `ci.yml`, `release.yml`, `security.yml`; Dependabot; issue/PR templates |
| `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md` | Attribution and fork changes; security policy; contributor guide |

## 3. Commands

Run from the repository root. Requires Node.js 22+, pnpm 10, and Docker for integration/E2E tests.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Typecheck | `pnpm typecheck` |
| Unit tests | `pnpm --dir apps/web test` |
| Smoke tests | `pnpm --dir apps/web test:smoke` |
| Start test Synapse | `node scripts/test-synapse.mjs start` (optional `SYNAPSE_ROOM_VERSION=11\|12`) |
| Integration tests | `pnpm --dir apps/web test:integration` |
| End-to-end tests | `pnpm --dir apps/web test:e2e` |
| Refresh screenshots | `CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshots` |
| Regenerate icons/art | `node scripts/generate-branding.mjs` |
| Regenerate stickers | `node scripts/generate-stickers.mjs` |
| Desktop compile | `pnpm --dir apps/desktop run build:electron` |
| Dev servers | `pnpm dev:web`, `pnpm dev:desktop` |
| Release | push a tag `vX.Y.Z` (see §4) |

Run the relevant tests after every change.

## 4. Working agreements

- **Small commits**, each explaining *why*, ending with the `Co-Authored-By` trailer the harness specifies.
- **Run tests after each step.**
- **Ask before outward-facing actions** (pushing to `main`, tagging releases, deleting repos, changing repo
  settings) unless the owner has approved them. Work branches may be pushed so CI runs.
- **Release tags:** `vX.Y.Z` (prereleases `vX.Y.Z-beta.N`). The first release is `v0.1.0`.
- **Git identity:** repo-local `PeytonG <47164665+PeytonG@users.noreply.github.com>`. Never commit the owner's
  personal email.
- **Secrets:** the Android release key lives outside the repo at `%USERPROFILE%\Meadhall-android-signing\`
  (with a README holding its password), backed up to `Documents\Meadhall-android-signing-backup`, and in the `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` GitHub secrets. Never commit
  it; losing it means Android users can't receive updates.
- **Access:** only PeytonG has access to the repository. Vitosicz (upstream author) appears under "Contributors"
  because he authored the original commits; do **not** rewrite history to remove his authorship.

## 5. License rules (AGPL-3.0)

- Keep `LICENSE` and all copyright notices. MIT/GPL relicensing is not possible.
- Every new source file starts with `SPDX-License-Identifier: AGPL-3.0-only` (in a `//`, `/* */` or `#` comment).
- `NOTICE` lists what the fork changed; keep it current.
- Settings shows a **Source code** link (`getSourceCodeUrl(config)`; deployers set `source_code_url`). It satisfies
  AGPL §13 for hosted copies; do not remove it.
- Bundled fonts Pixelify Sans and Silkscreen are OFL-1.1.

## 6. Compatibility identifiers (do not rename)

The rename Heorot → Meadhall is user-facing only. These keep their names deliberately:

| Identifier | Why |
|---|---|
| Event types `com.heorot.categories`, `com.heorot.channelOrder`, `com.heorot.emoji_pack`, `com.heorot.channel_access`, `org.heorot.voice_channel`, `org.heorot.channel_type`; well-known `org.heorot.voice` | Shared spaces with Heorot users |
| localStorage `heorot.*`, IndexedDB `heorot-core` | Renaming logs users out and wipes settings |
| `heorot://` origin, IPC `heorot:*`, `window.heorotDesktop`, `HEOROT_*` env vars, `@heorot/*` packages | Internal; no user value, avoids churn |
| `heorot-voice-relay` | External project |

## 7. Architecture decisions

### 7.1 Voice: MatrixRTC, Element Call compatible
Verified 2026-10-22 against Element Call main (v0.26.1, default **Compatibility** mode), lk-jwt-service v0.9.0 and
matrix-js-sdk 40.2.0.

- **Transport discovery:** `_unstable_getRTCTransports()` → `.well-known` `org.matrix.msc4143.rtc_foci` → config
  `default_server_config` rtc_foci → config `livekit_service_url`. Cached per client (failures for 60 s); `https:`
  only (or http localhost).
- **Token:** `POST {livekit_service_url}/sfu/get` `{room, openid_token, device_id}` → `{url, jwt}`. This is exactly what
  Element Call publishers do, because only `/sfu/get` assigns the legacy identity `@user:server:DEVICE` (`/get_token`
  and MSC4195 endpoints assign hashed identities). Same LiveKit room either way.
- **Join:** `joinMatrixRtcSession()` (`core/voice/matrixRtc.ts`, shared by the app and tests) →
  `joinRTCSession({userId, deviceId, memberId: "user:device"}, [], {…transport, livekit_alias: roomId},
  {callIntent: "audio", manageMediaKeys: encrypted, useExperimentalToDeviceTransport: true})`. To-device keys are
  **required** (Element Call only sends media keys that way). Nothing ever rings: voice channels send no
  `notificationType`; DM/group/room calls (`announceCall`) send `"notification"`, which the SDK emits only for the
  first joiner.
- **Calls outside voice channels:** DMs, group chats and plain rooms get a header call button (`ChannelHeader`
  `call` prop). The call view sits above the chat (`.main-voice-slot.is-call-strip`); others in a call show a
  "Call in progress / Join call" bar (`useRoomCalls`, live from MatrixRTC memberships). Profile **Call** opens the
  DM and starts its call. Voice channels keep their own behaviour (the owner likes it; don't change it).
- **Self mute/deafen** (`ui/voice/selfVoiceState.ts`): the user-panel buttons work outside calls, persist, and set how
  the next call starts (`joinMuted`/`joinDeafened`; joining muted never opens the mic). Deafen also mutes;
  undeafen restores only a mute that deafen caused.
- **Per-person volume 0–120%** (`ui/voice/volumeBoost.ts`): above 100% the voice plays through a Web Audio gain fed by
  `createMediaStreamSource` while the element plays at volume 0. The boost follows the chosen speaker (`setSinkId`)
  and the element's `muted` (deafen).
- **E2EE:** `MatrixRtcKeyProvider` (ratchetWindowSize 10, keyringSize 256) imports keys with livekit's
  `createKeyMaterialFromBuffer`; room option `e2ee` (not `encryption`, which also encrypts data channels);
  inline worker; `setE2EEEnabled(true)` after connect. Key events are format-compatible in both directions.
- **Participants:** resolved through session memberships (`rtcBackendIdentity → userId`), then by parsing
  `@user:server:DEVICE`. Subscriber-only connections with hashed identities are hidden.
- **Live audio settings:** device/processing changes call `restartTrack()` on the published mic (no rejoin); only the
  speech/music profile republishes; speaker switching works, including back to "default".
- **Fallback:** heorot-voice-relay when no transport is discovered (not visible to Element users).

### 7.2 Call permissions
`org.matrix.msc3401.call.member` is a state event; members can't send it at `state_default` 50, so originally only
moderators could join calls. New voice channels get `events[call.member] = channel level` via
`allowCallMemberships()`, which **edits the real power levels after creation**. Never pass `events` in
`power_level_content_override`: Synapse merges shallowly and drops version-specific defaults (v12 tombstone 150).
Joining checks `canJoinCalls()` first; admins of older channels get **Allow members to join calls**.
New DMs and group chats (`core/dm/directChats.ts`) call `allowCallMemberships(…, 0)` right after creation: group
chats use the `private_chat` preset, whose invitees (level 0) otherwise couldn't join calls.

### 7.3 Discord import
Never put `m.room.power_levels` in `initial_state`: it replaces server defaults, and on room versions below 12
`createRoom` fails with `M_FORBIDDEN`. Use `power_level_content_override` for scalars. In v12, room creators have
unlimited power (`powerLevel === Infinity`).

### 7.4 Desktop
- **Permissions:** deny everything except `media`, `notifications`, `clipboard-sanitized-write`, `fullscreen`, and
  only for the app origin. Auxclick disabled (Electronegativity).
- **Tray / login:** close-to-tray when the close setting is on; open at login (login items on Windows/macOS, XDG
  autostart `meadhall.desktop` on Linux), started hidden.
- **Updates:** electron-updater from this repo's GitHub Releases, `autoDownload` off. "Meadhall X is available" →
  **Update now** (download with progress, silent install, restart); Settings → Updates has "Check for updates".
- **Identity:** app ID `io.github.peytong.meadhall` (installs alongside Heorot). Electron 44.

### 7.5 Branding, theme and fonts
- `config.brand` (default in `core/config/branding.ts`) drives the sign-in heading, title and device names.
- `scripts/generate-branding.mjs` builds every icon, splash and the login art from `branding/`. It removes
  edge-connected white **or painted checkerboard** backgrounds. Outputs are committed.
- **Pixel theme** in `ui/styles/pixel.css` (imported last): square corners, stepped borders, bevelled action
  buttons, pixel icons (`components/PixelIcon.tsx`, 12×12 SVG grids).
- **Accent:** default bright purple `#a64dff`; the pixel color wheel picks any accent; `accentTokens()` keeps 3:1
  contrast with the background and 4.5:1 for button text. CSS defaults must match `accentTokens(DEFAULT, theme)`.
  The encrypted-channel badge stays green on purpose.
- **Fonts:** Settings → Appearance → Font: Pixel (`pixel`, default), Pixel headings (`mixed`), System (`system`) or
  Other (`custom` + `customFontFamily`, any installed font: `queryLocalFonts()` where available, which the desktop
  app allows via the `local-fonts` permission, else a canvas probe of common families; see `theme/systemFonts.ts`).
  `appearance.fontStyle` → `data-font` on `<html>` → swaps `--font-pixel-body` / `--font-pixel-display`.
  All UI fonts must use those variables.
- **Discord-style UI:** user panel with mic/deafen/settings, Voice Connected panel, date dividers, rail pill,
  Online/Offline members. Profile pictures are round (`pixel.css` exception list); server icons stay square.
- **Home** (`components/HomeSidebar.tsx`): the app icon at the top of the rail (`data-testid="rail-home"`, internal id
  `PEOPLE_SPACE_ID`) opens a filter, **Direct Messages** (DMs with one other person, `isOneToOneRoom`) and **Group
  Chats** (bigger DMs plus joined rooms with no parent space, `homeOtherRooms`). Only Home conversations get the
  call button; server text channels don't (Discord behaviour).
- **Layout** lives in CSS (`App.css` "Layout: tablets and phones"); the channel-pane width is the
  `--channels-pane-width` variable, never an inline grid. ≤1100px: the right panel is an overlay opened on demand
  (`isNarrowLayout` + `narrowPanelOpen`, so the saved desktop panel mode is untouched). ≤760px (Android): one
  screen at a time (`mobilePane` list/chat → `mobile-show-*` classes), back button in the header, and a history
  entry so Android's Back returns to the list. `viewport-fit=cover` + safe-area padding; settings are full screen
  with a tab strip.
- **Voice changer** (`ui/voice/voiceChanger.ts`): Off/Giant/Pixie/Robot/Great hall/Radio/Troll, a livekit
  `TrackProcessor` on the mic (`applyVoiceEffect`, live), so Element users hear it too. Plain Web Audio nodes (no
  AudioWorklet): pitch = two cross-faded ramped delay lines. Measured in Chromium: 220 Hz → 160 (Giant), 331
  (Pixie), 122 (Troll); pitch-up gets +70% make-up gain. Settings → Audio has "Hear yourself" (mic test through
  the effect). Setting: `audio.voiceEffect`.
- **Layout previews:** `PREVIEW_DIR=<dir> pnpm --dir apps/web exec playwright test preview` screenshots desktop,
  tablet and phone views of the seeded demo hall (`e2e/support/seedHall.ts`, also used by README screenshots).
- **Stickers:** 12 sprites from `generate-stickers.mjs`, sent as standard `m.sticker` (uploaded once per homeserver,
  mxc cached); inlined `data:` assets are decoded because the CSP blocks fetching them.

### 7.6 Testing and CI
- Integration tests run against Synapse v1.163 on **room versions 11 and 12** (CI matrix).
- E2E serves the production build with a hostname-specific config; channels are unencrypted (API can't encrypt).
- CI: `ci.yml` (checks, integration, E2E), `security.yml` (CodeQL, dependency review, gitleaks, `pnpm audit
  --audit-level high`, Electronegativity), `release.yml` (tags → draft release → Windows/Linux/Android → publish).
  Actions are pinned to commit SHAs. `.gitleaksignore` holds one reviewed false positive by fingerprint.

## 8. Gotchas

| Symptom | Cause / fix |
|---|---|
| `require("electron")` returns a path | VS Code sets `ELECTRON_RUN_AS_NODE=1`; unset it before launching Electron |
| Code silently dropped by PowerShell edits | `"$nlimport"` is one variable; use the Edit tool for source edits |
| `// SPDX` became `/ SPDX` | Git Bash mangles a leading `//` in arguments |
| Sign-in "Failed to fetch" on `http://` or a delegated domain | Browsers don't follow redirects on CORS-preflighted requests (the login POST). `resolveHomeserverBaseUrl()` in `core/auth/loginFlow.ts` resolves `.well-known` / the redirected `/versions` URL first, like Element |
| Boosted call audio is silent | Chromium outputs silence from `createMediaElementSource` on remote WebRTC audio; use `createMediaStreamSource(element.srcObject)` and keep the element playing (volume 0) |
| Group-chat members can't join calls | `private_chat` preset leaves invitees at level 0; `allowCallMemberships(…, 0)` after creating DMs/groups |
| Perl `s\|…\|…\|` edit lands at the top of a file | `\|` inside a `\|`-delimited pattern ends it early; use the Edit tool or another delimiter |
| Sticker send "Failed to fetch" | Vite inlines <4 KB assets as `data:`; CSP blocks fetching them |
| Electron 44 build errors on login items | `openAsHidden`/`wasOpenedAsHidden` removed; use `wasOpenedAtLogin` |
| Electron binary missing after upgrade | `node node_modules/electron/install.js` in `apps/desktop` |
| Synapse EACCES on Linux CI | `generate` hands the data dir to uid 991; overrides mounted separately |
| E2E stuck after reload | Fresh accounts get "Set up secure backup" again; use `waitForAppShell()` |
| Typecheck compiles matrix-js-sdk sources | Every `matrix-js-sdk/src/*` deep import needs a tsconfig `paths` entry |
| Local Windows installer build fails (symlinks) | Needs Windows Developer Mode; CI runners are fine |
| `pnpm dlx` tool blocked (build scripts) | Use `npm_config_ignore_scripts=true npx …` |

## 9. Status

| Area | State |
|---|---|
| Typecheck fix | ✅ |
| MatrixRTC voice (Element compatible), call permissions, live audio settings | ✅ |
| Desktop: updates (Update now), tray, login, permissions, Electron 44 | ✅ |
| Tests: 129 unit, 10 smoke, 7 integration (v11 + v12), 7 E2E | ✅ all passing |
| Release pipeline (Windows NSIS, Linux AppImage + rpm, Android APK, release-signed) | ✅ |
| Security: audit 140 → 1 accepted, CodeQL findings fixed, scans in CI, GitHub protections on | ✅ |
| Branding: Meadhall name, owner's icon + art, pixel theme, color wheel, fonts, stickers, Discord-style UI | ✅ |
| Docs: README, self-hosting, CONTRIBUTING, SECURITY, NOTICE, templates | ✅ |
| PR #3 merged to `main` (2026-10-22) | ✅ |
| `v0.1.0` release (Windows, Linux, Android) | ✅ published: https://github.com/PeytonG/Meadhall/releases/tag/v0.1.0 |
| Old GitHub fork `PeytonG/Heorot` deleted | ✅ (by the owner; the CLI lacks the `delete_repo` scope) |
| Default server `https://elementprojectzkypg.duckdns.org`; registration-token field on sign-up | ✅ (branch `fix/homeserver-discovery`) |
| Fonts (Other = any installed font), round avatars, mute/deafen anytime, 120% volume, DM + group calls | ✅ (same branch) |
| Discord-style Home (Direct Messages + Group Chats), phone/tablet layouts, voice changer | ✅ (same branch; not yet pushed) |

## 10. Open issues and roadmap

- **Multi-SFU calls:** we only connect to our own SFU, so Element users publishing on another homeserver's SFU aren't
  heard (they hear us). Needs one LiveKit subscriber connection per remote transport (`/get_token`).
- **Matrix 2.0 mode:** js-sdk 40.2 hashes `user|device|member`; lk-jwt-service hashes JSON. Upgrade matrix-js-sdk
  (44+) before Element Call makes that mode the default.
- MSC4195 `url`-only transports aren't supported yet (falls back to the relay).
- Push notifications; iOS; code signing for Windows/macOS.

## 11. Work log

| Date | Work |
|---|---|
| 2026-10-22 | Forked Heorot; fixed typecheck; MatrixRTC voice verified against Element Call/lk-jwt-service source; desktop updater, tray, login, permissions; Synapse integration + Playwright E2E + CI; release pipeline; security audit and scanning; renamed to Meadhall; standalone repo `PeytonG/Meadhall`; owner's artwork; pixel theme, color wheel, fonts, stickers, Discord-style UI; one-click updates; live audio settings; docs; CodeQL test-tooling fixes; Android release key + secrets (backed up to Documents); Synapse script hang fix; PR #3 merged; old fork deleted; `v0.1.0` released (all 6 jobs green); sign-in resolves the homeserver address (`.well-known`, http→https) before logging in or registering. Then: default server + registration tokens, font picker, round avatars, mute/deafen outside calls, volume boost to 120%, DM/group calls with notifications. Then: Discord-style Home, phone layout (Android Back), voice changer, README screenshots. |
