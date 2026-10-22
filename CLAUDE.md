# Meadhall — Project Guide (CLAUDE.md)

> The single source of truth for **AI agents and human maintainers** working on Meadhall: what it is, how to work
> on it, every significant decision and *why* it was made, known pitfalls, current status and the work log.

| | |
|---|---|
| **Repository** | [github.com/PeytonG/Meadhall](https://github.com/PeytonG/Meadhall) (public, standalone) |
| **Owner** | PeytonG |
| **Upstream** | Fork of [Vitosicz/Heorot](https://github.com/Vitosicz/Heorot) (git remote `upstream`) |
| **License** | AGPL-3.0 (inherited from Heorot and Element; cannot be changed) |
| **Latest release** | `v0.3.0` (2026-10-23; first release `v0.1.0`) |
| **Last updated** | 2026-10-23 |

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
| UI interaction tests (part of E2E) | `pnpm --dir apps/web exec playwright test ui-interactions` |
| Real desktop app test (Windows) | `pnpm --dir apps/desktop run build`, then `pnpm --dir apps/web exec playwright test -c playwright.desktop.config.ts` |
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
- **UI work isn't done until it's tested like a user would use it** (owner's rule). Add or extend E2E tests for hit
  areas, scrolling, pickers and dismissing modals (`e2e/ui-interactions.spec.ts`), run them, and for anything the
  desktop app draws differently (title bar, drag regions, window controls) run the real Electron test too.
  Browser-only tests can't see Electron drag regions: use `isWindowDragRegionAt()` (`e2e/support/desktop.ts`).
- **Ask before outward-facing actions** (pushing to `main`, tagging releases, deleting repos, changing repo
  settings) unless the owner has approved them. Work branches may be pushed so CI runs.
- **Release tags:** `vX.Y.Z` (prereleases `vX.Y.Z-beta.N`). The first release is `v0.1.0`.
- **Changelog:** every user-facing change gets a plain-language line under `## Unreleased` in `CHANGELOG.md`, in the same PR.
  Before tagging, rename that section to `## vX.Y.Z (date)`: the release workflow publishes it as the release notes
  and refuses to release a tag without one.
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
  **required** (Element Call only sends media keys that way). Voice channels send no `notificationType`; 1:1 DM
  calls send `"ring"` and group calls `"notification"` (`announceCall`), which the SDK emits only for the first
  joiner.
- **Incoming calls** (`hooks/useIncomingCall.ts`, `components/voice/IncomingCallCard.tsx`, `voice/ringtone.ts`): an
  RTC/call notification from someone else in a Home room shows "X is calling" (Join/Dismiss) and loops an original
  Web Audio chiptune until joined, dismissed, the caller leaves, or the notification's lifetime (≤ 90 s) ends. The
  caller never rings; notifications replayed at startup never ring. OS notification too when in the background.
- **Speaking detection** (`voice/voiceActivity.ts`): local Web Audio RMS per track (threshold 0.012, 350 ms hold,
  50 ms poll) OR'd with LiveKit's server-side speakers, which lag ~0.5 s.
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
- **Identity:** app ID `io.github.peytong.meadhall` (installs alongside Heorot; also the Windows AppUserModelId,
  set at startup so toasts are delivered). Electron 44.
- **Drag regions:** only title-bar strips (`.channel-header`, `.pane-top`, `.home-search`, `.rs-panel-header`,
  `.settings-header`) have `-webkit-app-region: drag`; their controls and every overlay opt out. **Never** make
  `html`/large areas draggable: drag regions swallow clicks and wheel scrolling (that was the dead color wheels,
  finicky scrolling and half-working menus before v0.3.0).
- **Window controls color:** the overlay (`titleBarOverlay`) follows the color behind it: the renderer samples it
  (`ui/desktop/titleBarColors.ts`) and sends `heorot:setTitleBarColors` after theme/layout changes.
- **Notifications:** on by default; clicking one calls `heorot:showWindow` (restores from the tray) and opens the
  room. `backgroundThrottling: false` so the hidden window keeps syncing.
- **Tests:** `MEADHALL_USER_DATA_DIR` gives the app a throwaway profile; `e2e-desktop/desktop.spec.ts` launches the
  real app and captures the OS-drawn window to compare colors.

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
- **Speaking campfire** (`ui/voice/campfire.ts`, `components/voice/PixelCampfire.tsx`): replaces the green speaking
  ring. Small hand-drawn flame sprites on a 20-cell grid (avatar = 16 cells, SVG 125% of the avatar, offset
  -12.5%/-37.5%) that **only rise from the top of the avatar and stay within its width** (owner: never cover text;
  less dramatic). 3 frames cycled by CSS. Keep the grid coarse (owner wants chunky pixels).
  Per-person on/off + color live in the Matrix profile, key `io.github.peytong.meadhall.campfire`
  `{enabled, color}` (`ui/voice/flameColor.ts`, cached 5 min). Off = the original green ring
  (`SpeakingCampfire` `ringClassName`). Set in Settings → Audio (`CampfireSettings.tsx`).
- **Pixel emoji** (`emoji/unicodeEmoji.tsx`, default on, Appearance toggle `appearance.pixelEmoji` →
  `data-pixel-emoji`): standard emoji in messages, reactions and pickers are wrapped in `.unicode-emoji` (still real
  text) and drawn through an SVG pixelate filter (`PixelEmojiFilter` at the app root: sample on a grid + dilate).
- **People search** (`search/userSearch.ts`): every typed word must appear in the display name, username or ID
  (accent-insensitive); local matches show instantly, the server directory merges in. Synapse's directory only
  finds people sharing a room unless the server sets `user_directory.search_all_users: true`.
- **Layout previews:** `PREVIEW_DIR=<dir> pnpm --dir apps/web exec playwright test preview` screenshots desktop,
  tablet and phone views of the seeded demo hall (`e2e/support/seedHall.ts`, also used by README screenshots).
- **Stickers:** 12 sprites from `generate-stickers.mjs`, sent as standard `m.sticker` (uploaded once per homeserver,
  mxc cached); inlined `data:` assets are decoded because the CSP blocks fetching them.

### 7.6 Roles and permissions (`core/roles`)
Discord-style roles mapped onto Matrix so the server enforces them (and Element users are bound by them):
- Space state `io.github.peytong.meadhall.roles` `{roles: [{id, name, color, rank 1-99, permissions[]}]}`;
  assignments `io.github.peytong.meadhall.member_roles` with state key **`user:@id`** (state keys starting with
  `@` can only be set by that user); channel viewers `io.github.peytong.meadhall.channel_view` `{roles}`.
- Member level = highest role rank; each permission's minimum = lowest rank granting it (so higher roles inherit
  lower roles' permissions). Applied to the space and every channel by the editor's app (`syncRoles`). Never
  touched: admins (100+), v12 creators, anyone at/above you, and people never given roles in Meadhall.
- Channels limited to roles become invite-only; the editor invites people who gain access (Meadhall auto-joins
  invites to channels of servers you're in) and removes those who lose it.
- UI: Server Settings → Members (`settings/server/tabs/MembersTab.tsx`); member list names take the top role color.

### 7.7 Server admin panel
Settings → Server admin, shown only when `GET /_synapse/admin/v1/users/<me>/admin` says admin (and re-checked in the
tab; Synapse rejects non-admins anyway). Registration tokens and user management via `core/admin/synapseAdmin.ts`.
The test Synapse has a test-only `registration_shared_secret` so E2E can create admins (`registerAdmin`).

### 7.8 Android background notifications (`apps/mobile/android/.../meadhall/`)
No Google services (owner's choice: no extra apps or accounts). `SyncService` (foreground, type
`remoteMessaging`, minimum-importance "Meadhall is connected") polls `GET /_matrix/client/v3/notifications` every
30 s and posts notifications while the app isn't on screen; `BootReceiver` restarts it. **Never a second `/sync`**
on the same device: it would consume to-device messages (encryption keys). Encrypted messages show "New message".
The web app drives it through the `MeadhallSync` Capacitor plugin (`ui/platform/androidBackgroundSync.ts`).
Android sessions sign in **without refresh tokens** (`core/platform/android.ts`) because the service polls for
hours while the app can't refresh; users updating from older versions must sign out and in once. FCM could be added
later if the owner creates a Firebase project (needs Sygnal on the server).

### 7.9 Testing and CI
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
| Release published without desktop files (v0.2.0) | electron-builder `--publish always` couldn't find the draft through the releases list and created its own drafts. Desktop jobs now build with `--publish never` and `gh release upload` to the tag's draft; the publish step refuses to publish unless every installer and `latest*.yml` is attached. v0.2.0 was repaired by hand from the workflow artifacts |
| Pictures broken a few minutes after sign-in (desktop) | Sessions use refresh tokens (Synapse access tokens last ~5 min) and the server enforces authenticated media (`/_matrix/media/v3` 404s). The desktop media hook must get every refreshed token (`core/auth/accessTokenEvents.ts`); the timeline also falls back to a signed fetch. `e2e/media.spec.ts` blocks service workers to reproduce |
| Screen share choppy at any FPS | Chromium encodes simulcast VP8 screen content at 2–5 fps. Screen shares publish with `simulcast: false` (measured: 3 → 57 fps at 1080p60) |
| Perl/sed edits silently do nothing | Most files have CRLF endings; `\n`-anchored patterns miss. Prefer the Edit tool, or strip `\r` first |
| Desktop: clicks, drags or scrolling dead in places, fine in a browser | An Electron drag region (`-webkit-app-region: drag`) covers it. Check with `isWindowDragRegionAt()`; see §7.4 |
| "You are not allowed to set others state" | State keys starting with `@` are reserved for that user; prefix them (`user:@id`) |
| Shell heredocs/`node -e` scripts break on apostrophes | The Bash tool wraps commands in single quotes; write files with the Write tool instead |
| Playwright: "Cannot accept dialog which is already handled" | Two `prompt`/`confirm` dialogs in a row: register one handler that answers both before clicking |
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
| Tests: 153 unit, 10 smoke, 8 integration (v11 + v12), 24 E2E, 1 real-desktop | ✅ all passing |
| Release pipeline (Windows NSIS, Linux AppImage + rpm, Android APK, release-signed) | ✅ |
| Security: audit 140 → 1 accepted, CodeQL findings fixed, scans in CI, GitHub protections on | ✅ |
| Branding: Meadhall name, owner's icon + art, pixel theme, color wheel, fonts, stickers, Discord-style UI | ✅ |
| Docs: README, self-hosting, CONTRIBUTING, SECURITY, NOTICE, templates | ✅ |
| PR #3 merged to `main` (2026-10-22) | ✅ |
| `v0.1.0` release (Windows, Linux, Android) | ✅ published: https://github.com/PeytonG/Meadhall/releases/tag/v0.1.0 |
| `v0.2.0` release (Home, DM calls, voice changer, phone layout) | ✅ published: https://github.com/PeytonG/Meadhall/releases/tag/v0.2.0 (desktop files re-attached by hand, see Gotchas) |
| Old GitHub fork `PeytonG/Heorot` deleted | ✅ (by the owner; the CLI lacks the `delete_repo` scope) |
| Default server `https://elementprojectzkypg.duckdns.org`; registration-token field on sign-up | ✅ merged (PR #6) |
| Fonts (Other = any installed font), round avatars, mute/deafen anytime, 120% volume, DM + group calls | ✅ merged (PR #6) |
| Discord-style Home (Direct Messages + Group Chats), phone/tablet layouts, voice changer | ✅ merged (PR #6) |
| `v0.2.1` (picture fix, smooth screen share, campfire) | ✅ published |
| `v0.3.0`: desktop drag-region fix, themed window controls, roles, admin panel, ringing, pixel emoji, people search, desktop + Android notifications | ✅ published (PR #9): https://github.com/PeytonG/Meadhall/releases/tag/v0.3.0 |

## 10. Open issues and roadmap

- **Multi-SFU calls:** we only connect to our own SFU, so Element users publishing on another homeserver's SFU aren't
  heard (they hear us). Needs one LiveKit subscriber connection per remote transport (`/get_token`).
- **Matrix 2.0 mode:** js-sdk 40.2 hashes `user|device|member`; lk-jwt-service hashes JSON. Upgrade matrix-js-sdk
  (44+) before Element Call makes that mode the default.
- MSC4195 `url`-only transports aren't supported yet (falls back to the relay).
- iOS; code signing for Windows/macOS; optional FCM push for Android (needs the owner's Firebase project + Sygnal).
- Notification taps on Android open the app but not yet the specific conversation (the intent carries `roomId`).

### 10.1 Owner's backlog for the next version (requested 2026-10-23; start here)
Work through these in small PRs, each with UI tests (§4). Notes are starting points, not decisions.

**Bugs**
1. **Ringtone is broken.** Reproduce first (incoming call card, `voice/ringtone.ts`, `IncomingCallCard.tsx`). Likely
   suspects: AudioContext blocked by autoplay policy until a user gesture (desktop: allow via
   `autoplayPolicy: "no-user-gesture-required"` in webPreferences), `setSinkId` failing, or the card unmounting.
2. **Notifications don't show in the Windows app** (worked on web; Linux/Fedora untested, probably the same).
   Check: Electron permission handler (`notifications` allowed only for the app origin; is `heorot://` matched?),
   `Notification.permission` in Electron, AUMID vs the installed shortcut (NSIS shortcut must carry the same
   AppUserModelId), and Windows Focus Assist. Consider showing them from the main process (`new
   electron.Notification`) via IPC, which is the most reliable on Windows/Linux. Test on the real desktop app.
3. **Own profile picture sometimes missing in calls** (others' show). Intermittent: likely the local participant's
   avatar resolving before the own `User`/member profile loads (`VoiceRoom` participant info). Fall back to
   `client.getProfileInfo(me)`.
4. **Two screen shares at once are clunky.** Show all active shares (grid/side-by-side stage with a focus toggle)
   instead of one stage with a picker.
5. **Call auto-leave:** if you're alone in a call for 5 minutes, disconnect and post a notice ("You were
   disconnected for being alone in the call for 5 minutes"; a local toast + a system-style message in the room
   for that user only, not a real room event).
6. **Transparent images** in chat should get a background (checkerboard or a neutral tile) so they're readable.

**Profiles and presence**
7. **Profile shows roles** in mutual servers: role chips grouped by server name (read `core/roles` per shared space).
8. **Custom status** (typed text) and manual presence: Online / Away (idle) / Do not disturb / Invisible
   (`setPresence({presence, status_msg})`; DND should also silence notifications locally).
9. **Editable profile banner** (image or animated GIF) above the avatar on profile cards: store as an mxc URL in an
   extended-profile field (like the campfire key), render with the GIF animating.
10. **Profile settings: editable About me** and optional fields (email shown publicly, social links); store in
    extended profile fields. Steam link could appear here (see 12).
11. **Desktop tray menu:** Mute, Deafen, and status (Online / Away / Do not disturb / Invisible), wired to the same
    state as the user panel (`selfVoiceState`, presence) via IPC.
12. **Activity / rich presence (explore):** Steam (Steam Web API `GetPlayerSummaries` with the user's SteamID and an
    API key from the server owner, polled by a small server-side bot or the client), manual "Playing ..." activity,
    or a Discord-RPC-compatible local socket in the desktop app. Publish as an extended-profile field.

**Roles (model it on Discord)**
13. **Full role editor:** today's roles are ranked power levels. Owner wants Discord-like control: create roles; per
    role choose which channels it can **see** and which it can **talk** in (separately), moderation powers, etc.
    Channel overrides per role (view / send / connect to voice / manage messages). Matrix mapping: view =
    invite-only/restricted membership; talk = per-channel `events_default`/`m.room.message` level set to the lowest
    rank allowed; voice = `call.member` level. Keep the server enforcing everything (§7.6).

**Voice**
14. **Expand the voice changer** with many more creative effects (e.g. chipmunk, demon, alien, underwater, cave
    echo, megaphone, ghost/whisper, helium, old radio, telephone, autotune-ish, reverse-echo). Same TrackProcessor
    approach (§7.5); measure each in Chromium like the existing ones.
15. **Soundboard in calls:** built-in clips (duck, fart, sword, airhorn, rimshot, sad trombone, applause, cheers,
    horn/mead-hall themed ones) plus user-added sounds (uploaded to the media repo, stored in account data or a
    space pack). Play into the call by mixing into the published mic track (Web Audio mix before the processor),
    with a per-user volume and a cooldown. Original/CC0 sounds only (license!).

**Platforms**
16. **iOS app with notifications.** Capacitor iOS (`npx cap add ios`) built in the cloud (Codemagic `codemagic.yaml`
    on a `mac_mini_m2`, or GitHub Actions macOS runners) with App Store Connect API keys (.p8, Key ID, Issuer ID) and
    automatic signing; ship via TestFlight. Notifications on iOS need APNs (no background polling on iOS): Synapse
    pusher → Sygnal with APNs credentials. Needs an Apple Developer account (owner).

**Presentation / defaults**
17. **Default homeserver back to `https://matrix.org`** (owner: more presentable). Change `DEFAULT_HOMESERVER_URL`
    in `core/config/serverDefaults.ts` and the README; keep the token field logic (it already adapts per server).
18. **README / GitHub page overhaul with many screenshots:** flames vs no flames on a speaker, Direct Messages,
    group chats, spaces, the roles editor and member list colors, profiles, settings (fonts, color wheel, voice
    changer), the admin panel, mobile views, and sign-up with a registration token. Extend
    `e2e/screenshots.spec.ts`/`seedHall.ts` to stage each scene (a speaking state can be faked by toggling the
    campfire's `active` in a test-only harness).
19. **Document registration options** in the README/self-hosting guide: open registration, registration tokens
    (Synapse `registration_requires_token`, created in the admin panel), email verification, reCAPTCHA, SSO/OIDC,
    and invite-only (admin creates accounts). Research how common Matrix servers do it (matrix.org, Element's docs,
    Synapse config docs) and show the matching Meadhall sign-up screen for each.

## 11. Work log

| Date | Work |
|---|---|
| 2026-10-22 | Forked Heorot; fixed typecheck; MatrixRTC voice verified against Element Call/lk-jwt-service source; desktop updater, tray, login, permissions; Synapse integration + Playwright E2E + CI; release pipeline; security audit and scanning; renamed to Meadhall; standalone repo `PeytonG/Meadhall`; owner's artwork; pixel theme, color wheel, fonts, stickers, Discord-style UI; one-click updates; live audio settings; docs; CodeQL test-tooling fixes; Android release key + secrets (backed up to Documents); Synapse script hang fix; PR #3 merged; old fork deleted; `v0.1.0` released (all 6 jobs green); sign-in resolves the homeserver address (`.well-known`, http→https) before logging in or registering. Then: default server + registration tokens, font picker, round avatars, mute/deafen outside calls, volume boost to 120%, DM/group calls with notifications. Then: Discord-style Home, phone layout (Android Back), voice changer, README screenshots. PR #6 merged; `v0.2.0` released (desktop files re-attached after an electron-builder draft mix-up; release workflow fixed). Then: v0.2.1 (pictures, screen share, campfire); CHANGELOG-driven release notes. Then v0.3.0 work: desktop drag-region fix + themed window controls, quieter campfire with local speech detection, people search, pixel emoji, incoming-call ringtone, roles/permissions, server admin panel, desktop + Android background notifications, much more UI testing (incl. a real Electron test). |
