# Meadhall — Project Guide (CLAUDE.md)

> The single source of truth for **AI agents and human maintainers** working on Meadhall: what it is, how to work
> on it, every significant decision and *why* it was made, known pitfalls, current status and the work log.

| | |
|---|---|
| **Repository** | [github.com/PeytonG/Meadhall](https://github.com/PeytonG/Meadhall) (public, standalone) |
| **Owner** | PeytonG |
| **Upstream** | Fork of [Vitosicz/Heorot](https://github.com/Vitosicz/Heorot) (git remote `upstream`) |
| **License** | AGPL-3.0 (inherited from Heorot and Element; cannot be changed) |
| **Latest release** | `v0.3.2` (2026-10-23; first release `v0.1.0`) |
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
- **Help:** any change to where something is in the UI updates `docs/help/meadhall-help.md` in the same commit. It
  feeds the in-app Help (? button) and is written for a small AI model to answer from (one question per `###`).
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
- **Per-person volume 0–130%** (`ui/voice/volumeBoost.ts`): above 100% the voice plays through a Web Audio gain fed by
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
  set at startup so toasts are delivered). Electron 44. Unpackaged (dev/test) runs use
  `io.github.peytong.meadhall.dev`: Windows gives the taskbar button the icon of any Start-menu shortcut carrying
  the same AUMID, and dev runs left an `Electron.lnk` that made the installed app show Electron's atom.
- **Linux packages:** AppImage, `.rpm` and `.deb`. `desktopName: meadhall.desktop` (package.json) sets the Wayland
  app_id and WM_CLASS `meadhall`, matching the desktop file's `StartupWMClass`, so GNOME shows our icon. Both
  packages declare the libraries Electron needs (ALSA, gbm, drm), or it won't start on a minimal install. Updates of
  `.rpm`/`.deb` go through `electron/linuxPackage.ts` (`pkexec dnf|zypper|rpm|apt-get install` the downloaded file),
  not electron-updater, whose RpmUpdater quotes the command so bash exits 127. `resources/package-type` says which
  package is installed (absent for AppImage, which keeps electron-updater's own install).
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
- **Who can talk** per channel is "a role and every role above it" (or everyone), stored as `talk` next to `roles`
  in `channel_view`. It sets the channel's `events_default` (and, in voice channels, the `call.member` level, also
  written to `com.heorot.channel_access` so the join-calls check agrees). Why ranked rather than an exact set like
  "see": Matrix decides sending with one threshold per room, so an exact set can't be enforced by the server;
  "see" can be exact because it is membership (invites/kicks). `setChannelViewRoles` and `setChannelTalkRole`
  merge, so setting one keeps the other.
- UI: Server Settings → Members (`settings/server/tabs/MembersTab.tsx`); member list names take the top role color.
- Profiles show the person's roles in every mutual server (`rightPanel/mutualServerRoles.ts`), falling back to
  Admin/Moderator from `member.powerLevel` (which counts v12 creators; the power-levels map doesn't).

### 7.7 Server admin panel
Settings → Server admin, shown only when `GET /_synapse/admin/v1/users/<me>/admin` says admin (and re-checked in the
tab; Synapse rejects non-admins anyway). Registration tokens and user management via `core/admin/synapseAdmin.ts`.
The test Synapse has a test-only `registration_shared_secret` so E2E can create admins (`registerAdmin`,
`makeServerAdmin`). Password reset is an in-page form: it used `window.prompt`, which Electron doesn't implement, so
it silently did nothing on desktop (the owner hit this; browser tests passed). **Never use `window.prompt`.**
Server notices (v0.3.3) use `PUT /_synapse/admin/v1/send_server_notice/<txn>`, one user at a time ("Everyone" pages
through `/v2/users`, skipping deactivated). They need `server_notices` in homeserver.yaml (the test Synapse has it);
without it the panel says so. Recipients get an invite that shows under Home → Group Chats (`homeInvites`).

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
- Playwright projects: `chromium` (desktop size) plus `android-phone` (Pixel 7) and `iphone` (iPhone 14 metrics in
  Chromium) for the phone-only specs (`mobile`, `mobileUpdates`). The real Electron suite
  (`playwright.desktop.config.ts`) needs `pnpm --dir apps/desktop run build` first: it runs the copied web build.
- Audio is tested for real in Chromium by rendering effects/sounds with `OfflineAudioContext`
  (`e2e/voiceEffects.spec.ts`, `e2e/soundboard.spec.ts`); the voice room smoke tests fake LiveKit.
- **Real calls** (v0.4.0): `node scripts/test-livekit.mjs start` runs livekit-server in Docker (7880/7881/7882,
  test key/secret in the script) and `e2e/support/lkTokenService.mjs` plays lk-jwt-service (checks the OpenID token
  against Synapse, signs an HS256 LiveKit JWT). `playwright.calls.config.ts` (`e2e-calls/`: join, soundboard,
  camera, push to talk) uses Chromium's fake mic/camera; CI runs it in the E2E job.
- **Accessibility**: `e2e/accessibility.spec.ts` runs axe-core (WCAG 2.1 A/AA, serious/critical) on sign-in, home,
  a channel and Settings.
- Screenshots for the README/`docs/SCREENSHOTS.md` are tests (`CAPTURE_SCREENSHOTS=1 ... playwright test
  screenshots`): `screenshots.spec.ts` and `screenshotsShowcase.spec.ts` stage the demo hall (`seedHall.ts`), roles,
  profiles and statuses. Recapture after visible UI changes and look at every image before committing.

### 7.10 Status, presence and activity (`ui/presence`)
- Online / Away / Invisible and the custom status text are real Matrix presence (`setPresence` + `status_msg`), so
  Element shows them. Synapse rejects `busy`, so **DND** (and the platform, and "Playing ...") travel in the
  extended-profile field `io.github.peytong.meadhall.status` `{state, platform, activity}`; Meadhall overlays it.
  Others' fields are cached and refreshed when their presence changes (`clientStatus.ts`, `usePresence.ts`).
- Presence is on for every platform (it was desktop-only). Synapse only lets you see presence of people you share a
  room with, and rate-limits presence writes hard (429 after a couple): presence and profile writes are each
  serialized to the newest value, run independently (profile mustn't wait behind a rate-limited presence write),
  and clear their "running" marker in `finally` (clearing it inside the loop left it stuck forever when there was
  nothing to send; that bug made DND never reach the server).
- Automatic Away after 10 min without input (`autoAway.ts`); desktop uses OS idle time (`powerMonitor`), so working
  in another app still counts. Phone users without a manual status show a pixel 📱 (`is-mobile` dot).
- "Playing ...": the desktop app reads Steam's own files (Windows `RunningAppID` registry value, `registry.vdf`
  elsewhere, names from `appmanifest_<id>.acf`; `apps/desktop/electron/steamActivity.ts`, parser `vdf.ts`). Chosen
  over the Steam Web API because it needs no API key, Steam login or server bot. Privacy toggle, default on.
- **Activity (v0.4.0)**, Settings → Privacy → Activity (`presence/activitySharing.ts`, desktop `electron/activity/`):
  sources Steam (default on), Rich Presence (arRPC's IPC + WebSocket transports, Meadhall answers only
  SET_ACTIVITY; WS refuses Origins other than none/discord.com), game detection (arRPC's `detectable.json`, Windows
  via CIM because 24H2 removed wmic), Linux MPRIS (playerctl or dbus-send). Names only from the local list, nothing
  looked up online. Audience: **contacts** (default; status text only, which Synapse shows only to people sharing a
  room), **dms** (encrypted to-device `io.github.peytong.meadhall.activity` to partners in *encrypted* DMs, re-sent
  every 4 min, 10 min TTL, accepted only if it arrived encrypted from a DM partner), **everyone** (also the
  world-readable profile field) or **nobody**. "Never share" list by name/app id; details only if allowed.
- DND silences notifications and call ringing locally (`isDoNotDisturb()`).
- **Other servers:** Synapse federates custom profile fields, so DND and "Playing" reach up-to-date Synapse servers;
  elsewhere the profile read fails and people show plain presence. Servers that never send presence (matrix.org turns
  it off) get a **?** badge (`presenceSupport.ts`: a server counts once presence has arrived for anyone on it; our
  own server always counts; nothing is decided before the first sync).
- **Share my status** (Privacy, default on): off publishes you as invisible (offline, no text, `{state: null,
  activity: null}`) while keeping your chosen status locally (`applyOwnStatus(..., share)`).

### 7.11 Profiles (`core/profile/richProfile.ts`)
Banner (mxc, rendered from the full file so GIFs animate), About me, a public email and up to 5 links, each an
extended-profile field (`io.github.peytong.meadhall.{banner,about,email,links}`): they follow the account and are
public, which the settings page says. Links are restricted to http(s) both when saving and when reading someone
else's profile (no `javascript:`/`data:`).

### 7.12 Several accounts (`core/storage/accounts.ts`, `ui/accounts`)
One account is active and runs the full client; the others wait in a vault (IndexedDB `account` table, key
`meadhall_accounts`) holding copies of their session slots and still-encrypted tokens. Switching swaps the slots and
**reloads**, so an account starts exactly like a normal app start (no second client in one page). Each account has
its own sync and Rust crypto databases via a store prefix (`mx_store_prefix`; the first account keeps the original
names, so no migration). `SessionLifecycle.clearStorage` clears only the active account (it used to clear whole
tables, which would wipe other accounts' keys). Inactive accounts are polled every minute via `/notifications` with
their own tokens (refreshed when they expire), like the Android service; clicking one switches and opens the room.
Not yet: Android's `SyncService` only covers the active account.

### 7.13 Voice changer and soundboard
- 29 effects (v0.4.0 added 10, `e2e/voiceEffects.spec.ts` checks all) built from standard Web Audio nodes (pitch-shift delay lines, vibrato, multi-tap echoes, filters,
  ring modulation, wave shaping) so they run everywhere; each is measured in Chromium (audible, no clipping,
  changed, pitch effects within 8%).
- Soundboard: 12 built-ins **synthesized** in an 8-bit style (`voice/soundboard/builtinSounds.ts`), so there are no
  sample files or licenses. Your own sounds (≤ 8 s, 1 MB, decodable) go to the media repo and are listed in account
  data `io.github.peytong.meadhall.soundboard`. In a call they go out on **their own track** again (v0.4.0,
  `voice/soundboard/soundboardTrack.ts`, track name `meadhall-soundboard`, published once, unmuted while a sound
  plays and muted 600 ms after, `dtx: false`), so listeners can turn other people's sounds down (all, or per person)
  without their voice: owner's v0.4.0 request. (v0.3.2 mixed sounds into the mic; v0.3.1's separate track was
  reported as "publishing silence" because it stayed unmuted.) Plays even with the mic muted. No cooldown yet.
- Sounds are trimmed before upload (`voice/soundboard/trim.ts`, `SoundTrimmer`): 0.2-8 s chosen on a waveform,
  re-encoded as mono 24 kHz WAV (keeps files small).
- Calls auto-leave after 5 minutes alone (`voice/aloneInCall.ts`), counting MatrixRTC memberships too: people on another
  homeserver's SFU are invisible to our LiveKit room, and counting only LiveKit made those calls end (owner's "calls
  drop every few minutes"). Unexpected LiveKit disconnects now rejoin up to 3 times (`voice/callLog.ts`
  `RECONNECT_DELAYS_MS`) and every join/drop/rejoin goes to a local call history shown in the call settings.
- Screen share: the picker shows thumbnails/app icons from `desktopCapturer` (`ScreenSharePicker`); the stage caps its
  height to the window (`--stage-max-height`) and several streams keep 16:9 in a grid sized by `stageGridStyle`.

### 7.14 Updates and "What's new"
- Desktop updates itself (§7.4). Phones can't, so they check GitHub's latest release (cached 6 h for the anonymous
  rate limit), show a notice with the APK/IPA link, and Settings → Updates has install steps and a switch. The
  release workflow stamps `VITE_MEADHALL_VERSION` into the mobile build; builds without it never nag.
- **What's new** (`core/updates/whatsNew.ts`, `WhatsNewDialog.tsx`): once after an update (desktop and phone apps),
  the CHANGELOG sections newer than the last version this install ran, from `CHANGELOG.md` bundled with `?raw`.
  The release workflow already refuses tags without a section, so release notes and What's new can't be skipped.
  Fresh installs see nothing; installs that predate the feature but had an account get the current notes.

### 7.15 iOS (Beta) (`apps/mobile/ios`, `codemagic.yaml`)
Capacitor iOS with Swift Package Manager (no CocoaPods), built on Codemagic (`mac_mini_m2`) on `v*` tags, signed
with an App Store Connect API key integration and uploaded to TestFlight. Icons come from `generate-branding.mjs`.
**Never built yet**: needs the owner's Apple Developer account and the key in Codemagic. Label everything iOS
**(Beta)** in user-facing text until the owner says otherwise (requested 2026-10-23). iOS builds are **not**
attached to GitHub releases: iPhones only install from the App Store or TestFlight, so the in-app update notice on
iOS opens TestFlight (`itms-beta://`) and README directs people to a TestFlight invite. iOS can't poll in the
background, so notifications need APNs through Sygnal (a push gateway) on the server.

### 7.17 Desktop shell (v0.3.2)
- **IPC sender check:** every handler is registered with `handleFromApp` (main.ts), which refuses messages not from the
  app's main frame on its own origin. Add new handlers the same way, never with `ipcMain.handle` directly.
- **Taskbar badge:** the renderer draws the icon with a red count bubble (`notifications/taskbarBadge.ts`, top-right
  like Discord; Windows' own overlays only go bottom-right) and the main process sets it as the window icon
  (`heorot:setUnreadBadge`, PNG data URL checked). The window also sets its plain icon explicitly (taskbar icon went
  missing otherwise).
- **Earlier versions:** `updater.installVersion` points electron-updater at `releases/download/vX.Y.Z` (generic provider,
  that release's latest.yml) with `allowDowngrade`; only `x.y.z` strings are accepted. 0.3.2 is the first version that
  can do this, which the UI warns about (`core/updates/releaseHistory.ts`).
- **Overlays come last in AppShell:** Chromium resolves `-webkit-app-region` in document order, so anything drawn over
  the title-bar strip (call card, banners) must be rendered after the layout as well as opting out with no-drag.

### 7.18 Bug reports and logs (v0.3.3)
- **Logs** (`ui/logs/appLog.ts`, Settings → Logs): error toasts, call errors, update errors and uncaught errors, kept
  in localStorage (200 entries), credentials redacted, each with a hint (`hintFor`). The call history is
  `ui/voice/callLog.ts`. Calls that end without the user choosing to call `announceCallEnded`, and
  `CallEndedNotice` (rendered by AppShell) shows why until dismissed.
- **Report a bug** (`core/bugReport/bugReport.ts`): sent from the reporter's account to
  `@peytongna:elementprojectzkypg.duckdns.org` (forks: `bug_report_recipient` in config.json), whose ID is never
  shown. Each report is a fresh unencrypted room with creation type `io.github.peytong.meadhall.bug_report`. Only the
  sender's copy is hidden (room list, DM suggestions, mutual rooms, taskbar badge: `isSentBugReport`, i.e. the type
  and the create event's sender is us). The recipient's Meadhall auto-joins report invites and lists them under
  Home → Bug reports (v0.3.4; before that they were hidden from the owner too). The reporter can't leave straight
  away: once every local user has left, the owner's server can't join through ours. So AppShell leaves and forgets
  the sender's copy once anyone else has joined (`cleanUpBugReportRooms`, run on member timeline events, new rooms
  and membership changes) or after 30 days. 3 reports an hour; images up to 8 MB.

### 7.19 Servers: menus, muting, channel types, inbox (v0.3.4)
- **Right-click menus** (`components/menus/ContextMenu.tsx` + `roomMenus.ts`): server (rail) and channel menus,
  and the member menu (`MembersPanel`). Submenus flip left near the window's right edge.
- **Muting** (`notifications/roomActions.ts`) is push rules via `roomNotificationAdapter` (Matrix-standard, so
  every device and Element). A server's level is account data `io.github.peytong.meadhall.space_notifications` and
  applied to channels joined later. Muted rooms are dimmed and excluded from unread counts, rail badges and the inbox.
- **View options** per server (hide muted channels, show all channels) are local (`stores/spaceView.ts`); the rail
  order is account data `io.github.peytong.meadhall.space_order`.
- **Channel types** (`core/rooms/channelType.ts`): state `io.github.peytong.meadhall.channel_type` in the channel,
  copied into the space child's `org.heorot.channel_type` (voice keeps its own event). Rules/news set
  `events_default: 50` with `m.reaction: 0`. Channel rows keep a visually hidden "#" so names still read "#general".
- **Server banner**: state `io.github.peytong.meadhall.space_banner` `{url}` in the space, shown under the name.
- **Voice channel chat**: state `io.github.peytong.meadhall.voice_chat` `{enabled}`; the chat renders beside the
  call (`main-body.has-voice-chat`).
- **Inbox** (`components/inbox/InboxPanel.tsx`, `notifications/unreadMessages.ts`): unread events after the read
  receipt; rooms whose receipt isn't in the loaded history count only if the server's count says so.
- **Calls** announce (ring/notify) only from Home rooms (`voice/callAnnouncement.ts`); server channels never do.

### 7.20 Badges (v0.3.4)
- Official list: `badges/badges.json` = `{payload, signature}`; payload has a fresh random salt per publish,
  PBKDF2-SHA256 (50k) fingerprints of user IDs, ECDSA P-256 signature checked against `core/badges/badgeKey.ts`.
  The app fetches it from raw.githubusercontent (main), caches it, never replaces a valid list with an invalid one.
- The owner runs `node scripts/badges.mjs grant|revoke|list|publish`; the private key and the plain holder list live
  in `~/Documents/Meadhall-badge-signing` (never in the repo). **Never write badge holders' IDs into the repo**
  (tests read the private holder file when present). Claims from the profile field
  `io.github.peytong.meadhall.badges` show only as "unofficial" behind "...".

### 7.21 Profile style, style profiles and sharing (v0.3.4)
- **Profile style** (`core/profile/profileStyle.ts`): profile field `io.github.peytong.meadhall.profile_style`
  `{card, nameplate}`, each a preset name or two `#rrggbb` colors (nothing else reaches CSS). Pixel icon style
  draws hard bands.
- **Style profiles** (`ui/sharing/styleProfiles.ts`): account data `io.github.peytong.meadhall.style_profiles`.
- **Sharing** (off by default, `ui/sharing/sharingSetting.ts`): `.meadhall` = JSON `{format:"meadhall",version:1,
  kind:"sound"|"style",...}` (`core/sharing/meadhallFile.ts` validates strictly: audio types only, 1 MB; style
  settings whitelisted). Shares are `m.file` messages with `io.github.peytong.meadhall.share` `{kind,name,emoji}`;
  Adopt re-uploads sounds to the adopter's server via `addCustomSound`.

### 7.23 Threads and cross-app verification (v0.4.1)
- **Threads** (`ui/threads`): the client runs with `threadSupport`, so the SDK moves `m.thread` replies out of the
  main timeline into per-thread timelines. `Timeline` takes `threadRootId` (thread panel: the thread's events, root
  first; threaded receipts; paginates the thread timeline) or `onOpenThread` (main chat: "N replies" bar, Reply in
  thread). The composer sends with `threadId`. In a thread, `m.in_reply_to` with `is_falling_back` is not a reply.
  Unread: the SDK's `Thread.getEventReadUpTo` calls every thread read until you send a threaded receipt, so the inbox
  goes by `getThreadUnreadNotificationCount`. "Mark read" sends one **unthreaded** receipt on the newest event in the
  room or any thread (`markRoomReadEverywhere`); a main-timeline receipt alone left thread replies unread forever.
- **Verification** (`core/crypto/securityRecoveryFlow.ts`): other apps trust a session when it carries a signature
  from the account's self-signing key. "This device verified" = own device `crossSigningVerified` (the device list's
  `verified` is always true for the current device: local trust). Entering the recovery key also runs
  `adoptCrossSigningWithRecoveryKey` (checks the key against the default secret-storage key, then
  `bootstrapCrossSigning({})`, which imports the keys from secret storage and signs this device; it only creates keys
  when none are in secret storage, which is checked first). A fresh `/keys/query` (`userHasCrossSigningKeys(me, true)`)
  is needed before the new signature shows locally. **Never** make a new recovery key when one exists and this
  session lacks the cross-signing private keys (`EXISTING_RECOVERY_KEY_MESSAGE`): that orphans them. A Meadhall-only
  account gets cross-signing keys created at recovery-key setup (first upload needs no UIA).
- **Verify this device** (SAS): don't call `generateQRCode()` on Ready; with Rust crypto it switches the request to
  QR and it gets cancelled. After verification, `refreshTrustStatus` (not `refreshDeviceVerification`, which re-runs
  the sign-in screens); `UserTrustStatusChanged` / `KeyBackupDecryptionKeyCached` pick up shared keys later.
- Tests: `e2e/threads.spec.ts`, `e2e/verification.spec.ts`, `e2e/verificationSas.spec.ts` (a Node Rust-crypto client
  stands in for FluffyChat: `setUpEncryptionLikeAnotherApp`).

### 7.24 Server bots (v0.5.0: `core/bots`, `apps/bot`)
- **Formats** (`core/bots/botProtocol.ts`, pure, shared with the bot): space state `io.github.peytong.meadhall.bots`
  (admins), `.commands` (state key = bot ID: only the bot can write it), `.onboarding`, `.automod`, and
  `.onboarding.response` (state key = member ID). `addBot`/`saveOnboarding` lower the power level for `.commands`
  and `.onboarding.response` to 0 (the homeserver still restricts "@" keys to their owner). A message running a
  command carries `io.github.peytong.meadhall.command` {bot, name, args}. All parsers cap lengths/counts and check
  answers against the server's own questions.
- **App**: Server Settings → Community → Onboarding / Auto-mod / Bots; BOT tag (`BotTag`); slash-command menu and
  usage hint in the composer (incomplete commands aren't sent); `OnboardingGate` replaces the composer until a
  member answers (`needsOnboarding`; admins 50+ and bots skip it). "Require it" (enforced) = every channel's talk
  role is the member role (§7.6), so the homeserver enforces it; a bot must grant the role.
- **Bot** (`apps/bot`, Node 22.18+ runs the .ts directly; Dockerfile): joins invites, keeps only servers listing it
  and their channels (a channel invite can arrive before the space join: re-checked after setup, left after 60 s);
  registers commands; grants onboarding roles with the app's own `applyRolesToPowerLevels`; welcome; auto-mod
  (redact, warn, timeout = level below events_default, ends kept in the bot's account data); moderation commands
  check the asker's kick/ban level and that the target ranks below asker and bot. New device per start (in-memory
  crypto), old "Meadhall bot" devices deleted. Use `RoomEvent.MyMembership` for invites
  (`RoomMemberEvent.Membership` didn't fire for them).
- Tests: `test/unit-tests/core/botProtocol.test.ts`, `e2e/bots.spec.ts` (spawns the real bot).
- The bot only accepts invites from `MEADHALL_BOT_ALLOWED_INVITERS` (default: its own homeserver), so strangers can't
  add it to their servers.

### 7.25 UI design system and phone layout (v0.5.0: `styles/mobile.css`)
- Follows the owner's references: "UI Design Principles" (Michael Filipiuk, PDF in the owner's Downloads) and UX
  Collective's iOS guide, plus Android's design guidance (developer.android.com/design/ui/mobile: 48 dp targets, 3-5
  nav destinations, overflow menus, 4.5:1 text contrast). Rules: 4/8 px spacing tokens (`--space-*`), type tokens
  (`--text-*`), 48 px touch targets (`--tap`), 16 px text in inputs (also stops iOS zooming on focus), nothing under 12 px that matters, body line
  height about 1.45, a focus ring on every control, `-webkit-tap-highlight-color: transparent` with `:active`
  states instead, safe areas (`--safe-top`/`--safe-bottom`).
- Phones (≤760 px): a full-width, centered bottom tab bar (Home, Inbox, You = status menu with Settings and "Sign in
  another device"; a fourth Admin tab, shield icon, only for accounts with the admin panel, i.e. homeserver admins:
  owner requirement, exactly 3 tabs otherwise), chat top bar
  = back, title, lock, call, "…" (search/members/pins move into "…"), settings as a grouped list with drill-in
  (`is-phone-list` / `is-phone-page`), long press on a message opens its menu as a bottom sheet (no hover bar on
  touch), dialogs as bottom sheets. Calls: Mute, Camera, More (sounds, deafen, voice settings), Leave; no screen
  share on phones (`canShareScreen`); the "Voice Connected" pill opens the call.
- `e2e/mobileTour.spec.ts` fails if any visible control on the main phone screens is under 44×44;
  `e2e/desktopTour.spec.ts` checks the desktop screens fit. Both save screenshots with `PREVIEW_DIR`.
- **Owner's decisions (2026-11-01): shapes are Rounded by default, with Square (the blocky pixel frames) as an
  option; pixel font, pixel icons and pixel emoji stay the defaults; everything can be switched either way, and
  rounded corners must be uniform.** Appearance → Font (Pixel / Pixel headings / System / custom), Icons (Pixel /
  Smooth), Shapes (Rounded / Square: `data-shape` on `<html>`, "smooth" or "pixel"; the square-only rules in
  `pixel.css` are scoped with `:where(:root[data-shape="pixel"])` so specificity doesn't change), Pixel emoji. Corner
  scale in `mobile.css` (`:where()`, so components can override): 4 px tags, 6 px swatches, 8 px fields/rows, 10-12 px
  tiles/cards, round chips. A corner audit (every bordered or filled control with a 0 radius) found and fixed the
  stragglers. Don't change defaults without the owner. Pixelify Sans reads small (16 px ≈ 13 px).
- **Words (owner, 2026-11-01): "server" means a Matrix homeserver only.** Spaces are "spaces" in everything users
  read (Space Settings, Leave space, per-space profile, the space's moderators). Internal names (`mode: "server"`,
  `ServerProfileDialog`, `settings/server/`) stay. The phone Admin tab is the homeserver admin panel.
- **Desktop design pass (owner, 2026-11-01):** one type scale on computers (12 px labels/times, 14 px secondary,
  16 px names/messages, 18 px titles), 4/8 px spacing, one primary button per screen. The owner keeps the red
  "Unencrypted" chip and the channel header's icon row as they are, and declined a contrast pass for faint grey text.
- **Phone app icon** (`scripts/generate-branding.mjs`): the scene inside the badge (no frame) full bleed for iOS and
  older Android; the adaptive foreground is that scene at 60dp fading into `#231c23`, so no mask clips the horn.
- **Presence blink:** `usePresenceMap` keeps showing someone online for 4 s after their presence drops
  (`withOfflineGrace`); a restarted sync rebuilt user info before presence arrived, so every dot blinked offline.
- **Look sync and the sign-in picker** (`settings/user/appearanceSync.ts`, `LookPicker.tsx`): the look (theme,
  accent, fonts, icons, shapes, emoji; not compact mode or line length, which stay per device) is account data
  `io.github.peytong.meadhall.appearance`, applied after the first sync and when another device changes it. With
  none saved, the picker is offered once (live preview; Done saves it, and the campfire choice to the profile). E2E
  test accounts get `{appearance: {}}` so the picker stays away (`skipLookPicker`).

### 7.26 Reports, moderation and app links (v0.5.0: `core/moderation`, `ui/moderation`, `ui/utils/permalink.ts`)
- Reasons: space state `io.github.peytong.meadhall.report_reasons` (defaults if unset). A report is its own private
  room (creation type `io.github.peytong.meadhall.report`) made by the reporter with the moderators invited
  (everyone at the ban level or above in the space, plus room v12 creators); details in state
  `io.github.peytong.meadhall.report`, outcome in `…report_status`. Moderators' Meadhall auto-joins report invites
  only from members of a server they moderate. Report and log rooms are left out of room lists (`listedRooms`).
- Actions (`applyModAction`): warn, kick, ban, timed ban, unban, mute (channel power level -1, previous levels
  saved), unmute, shadow mute, unshadow, dismiss. Sanctions are space state `io.github.peytong.meadhall.sanction`
  with state key `user:<mxid>` (a bare user ID as state key is only writable by that user). Timed bans and mutes are
  lifted by any moderator's Meadhall (checked every minute). Shadow-muted messages are hidden from everyone except
  the person and moderators (`extractMessageEvents`).
- Member records: a moderators-only log room (`io.github.peytong.meadhall.modlog`, linked from space state
  `…moderation_room`), one `…mod_action` event per action. Server Settings → Reports shows reports, records and
  reasons. `e2e/reports.spec.ts` covers report → shadow mute → timed ban.
- Room version 12 (the test Synapse's default): room IDs have no `:server`, creators aren't in `users` and may not
  be put there in `createRoom` overrides.
- App links: "Copy link" gives `meadhall://room/<room>/<event>`; `parseAppLink` also reads matrix.to and
  `matrix:` URIs. In-app clicks are caught in AppShell and open the room at the message (`Timeline` `focusEvent`).
  Desktop registers the scheme in packaged builds only (`setAsDefaultProtocolClient`, electron-builder
  `protocols`); Android has a VIEW intent filter and `MeadhallSyncPlugin` hands the link over (`openLink`).
- QR sign-in codes last at most 3 minutes: the code carries its expiry (`x`), the scanner refuses stale ones, and
  the test Synapse's `token_timeout` is 3m (recommend the same to server admins).

### 7.16 Accessibility
High contrast theme (`data-theme="contrast"`): pure black/white, white outlines, yellow focus ring, accent
brightened to 7:1. `e2e/contrast.spec.ts` walks every visible text node and requires 7:1 against its background
(the same audit flags 16 texts in the dark theme, so it has teeth).
**Reduce motion** (v0.4.0, `theme/motion.ts`): OS `prefers-reduced-motion` or Settings → Appearance sets
`data-reduce-motion="on"`; one CSS rule stops animations/transitions, `MotionImage` draws GIF banners as their
first frame. Channel groups are `role="list"`; sign-in mode switch is a tablist. axe runs in E2E (§7.9).

### 7.22 v0.4.0 features
- **Webcam** (`VoiceRoom` `toggleCamera`, `CameraTile`): 720p + 180p/360p simulcast; camera grid above the
  participants; camera picker in call settings. Switching cameras only when the choice changes (switching restarts
  the track; doing it on enable ended the just-published track). macOS usage strings, Android CAMERA (optional).
- **Push to talk** (call settings): key is a `KeyboardEvent.code`; presses are queued; window blur releases;
  letters/digits typed in inputs don't talk. A local-only level meter (separate getUserMedia, nothing sent) shows
  "Push to talk is on" when you talk without the key. Only while Meadhall is focused (no global hook yet).
- **Polls** (`ui/polls`): MSC3381 unstable events (Element-compatible) via the js-sdk `Poll` model; Meadhall field
  `io.meadhall.poll` `{anonymous, closes_at}`. Counting: latest vote per person before close, spoiled votes
  dropped, % per voter. The creator's app sends the end event (with a text summary) when time is up
  (`closeExpiredPolls` in AppShell every 15 s, and the card). Anonymous only hides names in Meadhall.
- **Code blocks**: `code/codeMarkdown.ts` (fences/inline), highlight.js core with 24 languages, lazy-loaded;
  output converted to tokens, never innerHTML. MessageRenderer keeps `pre`/`code` and basic formatting tags
  (no attributes). **Link previews** follow Privacy → Link previews (default: not in encrypted rooms).
- **QR sign-in** (`ui/auth`): `login/get_token` (password UIA) → QR `meadhall-login:1?hs=…&t=…`; sign-in screen
  scans (BarcodeDetector or jsQR) or takes a paste, then `m.login.token`. Needs Synapse
  `login_via_existing_session` (test Synapse has it). MSC4108 (Element) needs MAS, so not supported.
- **Translations** (`ui/i18n`): English text is the key; es, de, fr, pt-BR for sign-in, settings nav, composer
  placeholder, call controls. Language on the device (`meadhall.language.v1`), default from the browser.
- **Release engineering**: Electron fuses verified in a packaged build (runAsNode, NODE_OPTIONS, inspect off; ASAR
  integrity + only-from-ASAR on). Release workflow adds GitHub build provenance (Sigstore) for every file:
  `gh attestation verify <file> --repo PeytonG/Meadhall`. Flathub manifest (`packaging/flatpak`, repackages the
  .deb on Electron2.BaseApp 25.08; `scripts/flatpak-manifest.mjs <version>` fills URL + sha256), F-Droid draft
  recipe + `fastlane/metadata/android`, Obtainium link. Google services plugin removed from Android (unused).
  Self-update is off inside Flatpak/Snap.
- **Windows signing (planned for v1.0.0, the first non-beta release)**: SignPath Foundation (free for OSS). Their
  terms: OSI license with no proprietary components, automated builds verified by origin (GitHub Actions connector),
  **manual approval of every signed release**, MFA for everyone with access, product name/version metadata, a
  "Code signing policy" page linked from the home and download pages (`docs/code-signing.md`, with team roles and
  the `docs/privacy.md` link), and the certificate's publisher is **SignPath Foundation**. Apply at
  signpath.org/apply before v1.0.0; then add the `signpath/github-action-submit-signing-request` step to the
  Windows job. Not applied yet.

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
| A button does nothing in the desktop app only | `window.prompt` doesn't exist in Electron (returns null). Use in-page forms; `confirm`/`alert` do work |
| `\\` in Bash heredocs arrives as `\` | Doubled backslashes are halved on the way in; write regex/paths with the Write/Edit tools and grep the result |
| Text selectors match twice after DM previews | The DM list repeats the latest message; scope message checks to `.timeline` and rows to `getByTestId("home-row")` |
| Presence GET 403 / PUT 429 in tests | Synapse shows presence only between people sharing a room, and rate-limits writes; share a room, and expect delays |
| Room v12 creator shows as level 0 | Creators aren't in `users` of power levels; use `room.getMember(id).powerLevel` |
| A bug only reproduces after other tests ran | Run pairs with `-g "A|B"` to bisect; the badge test found a real read-marker race this way |
| Harness page keeps globals between `openHarness` calls | `setContent` keeps the window object: pass every harness global explicitly |
| Desktop test runs old code | The Electron app serves the copied web build: `pnpm --dir apps/desktop run build` after web changes |
| Async "loop running" flag stuck forever | A loop that finishes synchronously clears the flag before `??=` assigns it; clear it in `.finally()` |
| GitHub anchor links break on emoji headings | Put an explicit `<a id="..."></a>` before the heading and link to that |
| Installed Windows app shows Electron's atom on the taskbar | A Start-menu `.lnk` with the same AppUserModelID (dev runs made `Electron.lnk`). Dev runs now use a `.dev` AUMID; existing stray shortcuts must be deleted by hand |
| Fedora update: "Command pkexec exited with code 127" | electron-updater's RpmUpdater passes a quoted string that bash runs as one command name. We install `.rpm`/`.deb` ourselves (`linuxPackage.ts`) |
| Generic gear icon on GNOME's taskbar | Window app_id/WM_CLASS didn't match the desktop file; `desktopName` in package.json fixes both |
| `.deb` won't start: `libasound.so.2` missing | Declare deps in electron-builder `deb.depends`/`rpm.depends`; test in a clean `ubuntu:24.04` / `fedora:42` container |
| `RoomStateEvent.Events` never fires for a member joining | Listen to `RoomEvent.Timeline` and check `m.room.member` instead |
| `\b` in a regex became a backspace character | A `node` script with `"\\b"` in a template string; write regexes with Write/Edit and scan for control characters |
| Smoke tests can't import `@testing-library/react` | Not installed: render with `createRoot` + `act` like the existing smoke tests |
| Pixel icon is a solid blob in the channel header | The header's line-icon CSS (`stroke`, `fill: none`) applied to pixel rects; pixel icons are exempted |
| Screen share previews always "No preview" | The picker was given only id and name. Pass the whole source; previews arrive in a second call |
| Element hidden until hover can't be clicked by tests (or reached by keyboard) | `display: none` removes it from the accessibility tree; use `opacity: 0` |
| A test toggling the Members panel closes it | The button toggles; check `is-active` before clicking |
| Heredoc/`node -e` script fails on an apostrophe | The Bash tool quotes commands; write scripts with the Write tool |
| An old scratchpad script runs instead of a new one | A file with that name already existed and Write refused; use a fresh name |
| A branch ref file is all zero bytes after a power cut | Restore it from `git reflog`/`.git/logs` (write the last good SHA), then `git fsck`; also scan the tree for NUL-filled files |
| Every call join pops a notification and a sound | `rtc.notification`/call member events hit push rules; only notify for messages, stickers, polls and invites to you (`isNotifiableEvent`) |
| `encryptToDeviceMessages` returns an empty batch | Rust crypto only knows devices of users it tracks (members of encrypted rooms); `getUserDeviceInfo(…, true)` downloads others without tracking them |
| arRPC import fails / loads 4 MB at start | arRPC is ESM: import only its transports (Electron's Node `require`s ESM); `server.js` loads the game list and wmic scanner at import |
| Game detection finds nothing on Windows 11 24H2 | wmic was removed; use `Get-CimInstance Win32_Process` |
| Someone's new profile card shows only after 10 min | Style cache TTL; the profile panel now re-reads (`useProfileStyle(…, fresh)`) |
| Login helper "strict mode violation: 2 Sign in buttons" | A button named "Sign in with …" inside the form; keep extra buttons outside the `<form>` |
| Flatpak build: "state dir not on the same filesystem" | Pass `--state-dir` on the build's filesystem; runtime 24.08 is end-of-life, use 25.08 |
| Bot replies ping but never show; inbox "✓" does nothing | Thread replies (`m.thread`) live in thread timelines; see §7.23 |
| A teal/gray square where you last tapped (phones, screenshots) | The browser's tap highlight; off in `mobile.css` |
| "Playing …" stuck on a game you quit | Rich Presence lived as long as its socket; now dropped when its pid is gone, newest game first (`activity/index.ts`) |
| Logo fringed/ragged | The source is 200×200 pixel art in a JPEG with a fake checkerboard; `generate-branding.mjs` rebuilds it per grid cell |
| E2E poll on Matrix state throws on the first 404 | `expect.poll` stops on exceptions: wrap reads in `.catch(() => ({}))` (see `bots.spec.ts`) |
| Meadhall and FluffyChat disagree about who is verified | The session wasn't cross-signed; the recovery key now signs it (§7.23) |
| "Verify this device" cancels as soon as the other side answers | `generateQRCode()` on Ready; removed (§7.23) |

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
| `v0.3.1`: the whole §10.1 backlog except building iOS (status, profiles, accounts, soundboard, effects, talk permissions, Steam, What's new, high contrast, README) | ✅ released (PR #10); tests: 177 unit, 14 smoke, 8 integration, 45 E2E (incl. Android and iPhone sizes), 7 real-desktop |
| `v0.3.2`: §10.2 | ✅ released |
| `v0.3.3`: §10.3 (bug reports, logs, server notices, cross-server status, Linux packages and updates, taskbar icons) | ✅ released |
| `v0.3.4`: §10.4 (server menus, muting, channel types, inbox, badges, profile style, sharing, screen share fixes) | ✅ tests: 216 unit, 25 smoke, 8 integration, 87 E2E (11 screenshot-only skipped), 11 real-desktop; Linux .rpm screen-share previews checked in Fedora |
| `v0.4.0`: §10.5 (webcam, push to talk, polls, code blocks, activity audiences, QR sign-in, translations, reduce motion, provenance, Flatpak/F-Droid prep) | ✅ tests: 248 unit, 25 smoke, 8 integration, 105 E2E (11 screenshot-only skipped), 4 real LiveKit calls, 15 real-desktop; Flatpak built and linted in Flathub's image; release workflow dry run (Windows, Linux, Android) green |
| `v0.4.1`: threads, inbox clearing, cross-app verification (§7.23) | ✅ tests: 251 unit, 25 smoke, 111 E2E (11 screenshot-only skipped), incl. verification against a Rust-crypto client standing in for FluffyChat |
| `v0.5.0`: server bots (onboarding, auto-mod, slash commands, Meadhall bot), phone redesign, camera preview, sharper logo, Playing fix, look picker, reports and moderation, app links (§7.24–§7.26) | ✅ published 2026-11-02 (PR #22): https://github.com/PeytonG/Meadhall/releases/tag/v0.5.0 |
| `v0.5.1`: §10.6 (bot guide, auto-mod without a bot, onboarding and invite fixes, friends, help, notification sounds, call dock, stream previews, calls across homeservers, game overlay, admin panel) | ✅ published 2026-11-03 (PR #25): https://github.com/PeytonG/Meadhall/releases/tag/v0.5.1 |

## 10. Open issues and roadmap

- **Calls across homeservers (v0.5.1):** like Element Call's default "oldest_membership" mode, Meadhall connects to the
  SFU of the oldest call membership (`activeCallTransport` in `core/voice/matrixRtc.ts`), falling back to our own if
  that lk-jwt-service refuses us (it must allow federated users into existing rooms). True multi-SFU (`multi_sfu`,
  one subscriber connection per remote transport) is not implemented; nobody uses it by default yet.
- **Matrix 2.0 mode:** js-sdk 40.2 hashes `user|device|member`; lk-jwt-service hashes JSON. Upgrade matrix-js-sdk
  (44+) before Element Call makes that mode the default.
- MSC4195 `url`-only transports aren't supported yet (falls back to the relay).
- iOS needs a first real build (Apple Developer account + Codemagic key) and APNs/Sygnal for notifications; code
  Windows signing via SignPath at v1.0.0 (§7.22), macOS signing; optional push for Android needs a gateway.
- Switching accounts reloads the page, so it ends a call; keeping calls needs several clients in one page.
- Push to talk only works while Meadhall is focused (needs a native global key hook for background use).
- Notification taps on Android open the app but not yet the specific conversation (the intent carries `roomId`).
- Android's background service only covers the active account (§7.12).
- No OIDC-native sign-in (Matrix Authentication Service). matrix.org uses MAS: password sign-in works through its
  compatibility layer and Register falls back to its SSO page (checked against matrix.org on 2026-10-23).
- Soundboard has no cooldown; "talk" permissions are ranked (role and above), not exact sets (§7.6).
- **Next update (owner request, 2026-11-01): pan zoomed images.** In the image viewer (`Timeline.tsx` lightbox,
  `.timeline-lightbox-image.is-zoomed`), a zoomed-in picture can't be moved: you have to zoom out and back in. Add
  drag-to-pan with the mouse and one finger, pinch-zoom on touch, and keep a click/tap without dragging toggling the
  zoom; keep the backdrop/X/Escape closing (`ui-interactions.spec.ts` covers those).
- **Later (owner request, 2026-11-01): reports from DMs go to the homeserver admin.** Report is hidden outside
  servers for now (`UserProfilePanel.tsx`): in a DM there is no server owner to send it to. When the homeserver
  supports it (Matrix `POST /rooms/{roomId}/report/{eventId}` and `/users/{userId}/report`, MSC4151/MSC4260), send
  DM and user reports to the homeserver admins instead, and only show Report where that will reach someone.
- **Emulator keyboard:** Gboard always floats on the emulator (it sees the built-in AT keyboard as a physical one,
  which can't be removed). The AVD uses HeliBoard (open source, installed from its GitHub release), which docks.
- **Demo community:** `node scripts/demo-hall.mjs` (needs the test Synapse) fills it and runs the bot; sign in as
  `demo` / `meadhall-demo` at `http://localhost:8008`. Android emulator: SDK in `%LOCALAPPDATA%\Android\Sdk`, AVD
  `Meadhall_Pixel` (API 36); build debug APKs with JDK 21 and Gradle 8.14.3 (the owner's local wrapper edit points at
  9.7.1, which AGP 8 can't use), `adb reverse tcp:8008 tcp:8008`, debug builds allow HTTP to localhost.

### 10.1 Owner's v0.3.1 backlog (requested 2026-10-22/23; done on branch `v0.3.1`)
Each item shipped with tests; the design reasons are in §7. Numbers are the owner's.

| # | Request | Where / decision |
|---|---|---|
| 1 | Ringtone broken | Encrypted RTC notifications were ignored before decryption; listen for `Decrypted` (`useIncomingCall.ts`) |
| 2 | Windows notifications missing | Native notifications from the main process via IPC (`heorot:showNotification`) |
| 3 | Own picture missing in calls | Local tile returned early without an avatar; own ID used before the call membership syncs |
| 4 | Two screen shares clunky | Side-by-side grid, click to focus, "Show all" |
| 5 | Leave after 5 min alone | `voice/aloneInCall.ts` |
| 6 | Transparent images | Read as a complaint: the gray box behind pictures was removed. Asked the owner to confirm; if they wanted a checkerboard instead, it's a CSS change in `.timeline-image` |
| 7 | Roles on profiles | §7.6 |
| 8 | Custom status, manual presence | §7.10 |
| 9, 10 | Banner, About me, email, links | §7.11 |
| 11 | Tray menu | Mute/Deafen/Status, state mirrored over IPC (`tray.ts`) |
| 12 | Steam / activity | Local Steam files, §7.10 |
| 13 | Full role editor | See + talk per channel, §7.6 |
| 14 | More voice effects | 12 added (18 total), §7.13 |
| 15 | Soundboard | §7.13 |
| 16 | iOS (Beta) | Project + Codemagic → TestFlight; not built yet, §7.15 |
| 17 | Default homeserver matrix.org | `core/config/serverDefaults.ts` |
| 18, 19 | README with screenshots; sign-up docs | README modelled on the owner's reference layout; `docs/SCREENSHOTS.md` |
| 20, 21 | Phone swipe; send button | `AppShell` touch handler; `composer-send` |
| 22 | Phone UI testing | Pixel 7 + iPhone projects, §7.9 |
| 23 | Phone update notice | §7.14 |
| 24, 25 | DM previews; phone icon | `lastMessageSnippet.ts`; §7.10 |
| 26 | Several accounts | §7.12 |
| 27 | Automatic Away | §7.10 |
| 28 | High contrast theme | §7.16 |
| 29 | What's new after updates | §7.14 |
| — | Admin password reset broken on desktop (owner report) | `window.prompt` → form, §7.7 |

### 10.2 Owner's v0.3.2 list (2026-10-23)
| Request | What was found / done |
|---|---|
| Steam not showing under the name | Detection worked (checked against a real running game); it only displayed in others' DM rows. Now in the user panel, member list and profiles, and sent as presence status text |
| Taskbar icon missing | Window never set an icon; set explicitly |
| Soundboard "publishing silence", should play over mic and trigger speaking | Separate track replaced by mixing into the mic processor (§7.13) |
| Incoming call box not clickable (desktop, other chat) | Drag strip over it won by document order; overlays moved after the layout (§7.17) |
| Statuses slow | Profile fields re-read every minute, game in presence text; Synapse `rc_presence` limits ~1 change/10 s (self-hosting guide) |
| GitHub security alerts | Three CodeQL alerts fixed; full audit: no vulnerable deps, sanitised HTML rendering, link schemes allow-listed, IPC sender check added |
| Banner preview inaccurate, needs crop | Shared shape + `BannerImage`; crop (point + zoom) in `banner_crop` |
| Screen share preview box, scaling | Picker thumbnails; stage capped to the window; 16:9 tiles |
| Taskbar unread bubble (9+) | §7.17 |
| Block / Ignore | `m.ignored_user_list` + timeline filter + Privacy list |
| Soundboard volume | Audio setting, sliders in call settings / Sounds / Settings |
| Soundboard overflowing | Panel sized to the space above its button, scrolls, sticky header |
| Trim sounds | §7.13 |
| Calls disconnect every few minutes | App causes fixed (alone timer ignored other servers; no rejoin); call history to trace server-side drops |
| Install an earlier version, warn below 0.3.2 | §7.17 |
| Screenshots of soundboard and calls | Component harnesses (`e2e/harness`, `openHarness`) render in-call UI without LiveKit |

### 10.3 Owner's v0.3.3 list (2026-10-23)
| Request | What was found / done |
|---|---|
| Fedora rollback/update: "pkexec exited with code 127" | electron-updater quoting bug, reproduced in `fedora:42`; own installer (§7.4) |
| Icon style selector, pixel default | Settings → Appearance → Icons; `SMOOTH_ICONS` in `PixelIcon.tsx` |
| Verification: "other device is unknown" | SAS started before the other device accepted; button waits, device list refreshed first |
| Linux README commands fail on Fedora | Rewritten per distro (dnf/apt, FUSE 2 package names) and tested in containers; `.deb` added |
| Call end reason visible after the call | Logs page + call-ended notice (§7.18) |
| Report a bug to the owner, hidden from the reporter | §7.18 |
| Red Unencrypted chip | Channel header |
| Server notices in the admin panel | §7.7 |
| Fedora taskbar shows a generic icon | `desktopName` (§7.4) |
| Status across homeservers, ? if unsupported | §7.10 |
| Toggle sharing your status | §7.10 |
| Logs setting with helpful errors | §7.18 |
| Windows taskbar shows Electron's icon | Stray dev `Electron.lnk` with our AUMID (§8); dev AUMID split; owner deletes the old shortcut |

### 10.4 Owner's v0.3.4 list (2026-10-24)
| Request | What was found / done |
|---|---|
| See bug reports in Meadhall | They were hidden for everyone; now only the sender's copy (§7.18) |
| .meadhall sound sharing, customization profiles, share toggle (off) | §7.21 |
| Some server pictures broken | Rail used one thumbnail URL; falls back to full image, then initials |
| Server banners | §7.19 |
| Inbox and update arrow | §7.19 |
| Members sorted by rank, role control from the list | Role groups by rank; member menu → Roles |
| Channel types with pixel icons | §7.19 |
| Mute channels and servers | Push rules (§7.19) |
| Badges, founder coin, unofficial "..." for forks | §7.20 |
| Profile card gradients and member nameplates | §7.21 |
| Right-click server dashboard | §7.19 |
| GIFs don't loop | Uploads looped already; pasted GIFs were still PNGs from the clipboard. Fetch the original on paste |
| Per-channel unread counts | Existed; added rail badges and pips |
| Text chat in voice channels | §7.19 |
| Channel calls mustn't ring everyone | Text-channel calls did notify; fixed (§7.19) |
| In-call history only this call | Entries carry a call id (`beginCallLog`) |
| Screen share picker lag, black previews, scrolling to Share | See §8; picker opens instantly, previews fill in, dialog footers pinned |
| Taskbar icon must stay | Unchanged; checked by the real-desktop test |

### 10.5 Owner's v0.4.0 list (2026-10-25/26)
| Request | What was found / done |
|---|---|
| Turn down other people's soundboards | Own track again + global and per-person sliders (§7.13) |
| Smooth sound style | Settings → Notifications → Sound style (8-bit / Smooth), same tunes |
| Share sounds from the call | Share dialog in the in-call soundboard |
| More voice effects | 10 more (29) |
| Channel type only for server channels | Room settings hide it outside spaces |
| Voice channel chat below the call | Column layout |
| Discord integration | Feasibility report only (in the v0.4.0 report) |
| Polls (anonymous, %, time limit, results posted) | §7.22 |
| Webcam | §7.22, tested in real LiveKit calls |
| arRPC + MPRIS with privacy controls | §7.10 |
| Link previews, code highlighting | §7.22 |
| Sliding sync | Not switched on. js-sdk 40 does speak Synapse's native simplified sliding sync (MSC4186, the test server advertises it), but it has no presence extension (statuses, DND, Away, activity would break) and Meadhall's room list, spaces and unread counts assume every room is loaded. Needs presence over another channel and lazy room lists first |
| QR login, accessibility, translations | §7.22, §7.16 |
| Flathub, F-Droid/Obtainium, attestations, Electron hardening | §7.22 (store submissions are manual) |
| Push to talk with a reminder | §7.22 |
| SignPath for Windows signing at v1.0.0 | §7.22, `docs/code-signing.md` |
| Notification spam in calls, can't clear notifications | `isNotifiableEvent`; desktop notifications tracked per room and closed when the chat opens |
| "Messages self-deleted" | Meadhall never deletes on its own; redactions were invisible. Now "Message deleted by X"; undecryptable messages say so |
| Account switch drops the call | Not fixed: switching reloads the page (§7.12); needs two clients in one page. Now asks first during a call (`setInCallForSwitching`); other accounts' notifications already arrive |
| Badges in profile cards; window controls follow the card gradient | Badge outside the ellipsized name; `data-titlebar-color` |

### 10.6 Owner's v0.5.1 backlog (requested 2026-11-02; branch `release/v0.5.1`)
Not started unless the State column says otherwise. Every item ships in both looks (pixel and smooth fonts/icons,
rounded and square shapes) with tests; README screenshots in the smooth look. The owner attached Discord screenshots
as references; what they showed is described in each row.

| # | Request | Notes / plan | State |
|---|---|---|---|
| 1 | **A bot that enforces the rules; S-tier bot docs** | The Meadhall bot is `apps/bot` (§7.24); the owner hasn't tested it yet. Write `docs/bots.md` (linked from README and Space Settings → Community → Bots): create the bot account, credentials, every env var (incl. `MEADHALL_BOT_ALLOWED_INVITERS`), run with Node or Docker, keep it running (Docker restart policy, systemd, Windows), invite it to a space, give it a role with kick/ban/delete power, what each feature needs, troubleshooting (doesn't join, no power, encrypted rooms), security. Follow the guide end to end against a real setup before calling it done | ✅ `docs/bots.md`; new channels invite the space's bots and get role levels (`setUpNewChannel`) |
| 2 | **Auto-mod without a bot, if possible** | Told the owner: Matrix has no server-side rule engine a client can configure, so something with moderator power must be online to delete messages or time people out. Build "moderator clients enforce": any online Meadhall client with the power applies the space's `.automod` rules to new messages (dedupe: skip if already redacted; small random delay; modlog entry). Limits: nothing happens while no moderator is online; a message is visible until a moderator's client sees it; only rooms the moderator is in. The bot stays the reliable option; say so in the UI and docs | ✅ `core/moderation/moderatorDuties.ts` (needs an e2e test) |
| 3 | **Onboarding not working; jank in spaces** | The owner says onboarding "appears to not be working" and spaces/bots feel janky. Reproduce on the owner's real homeserver (not only the e2e Synapse): joining → onboarding dialog, answers saved, role granted (needs the bot), soft vs enforced gate, admins skipping it, rejoining, phone layout. Fix everything found; e2e case for each | ✅ invited spaces: Accept/Decline, channels join after, onboarding opens on entry (`e2e/onboardingInvite.spec.ts`); admins skip it → Preview as a newcomer |
| 4 | **Profile "..." menu cut off** | Right-panel profile (`ProfileHeader.tsx`, Copy MXID / Copy user ID): the menu opens past the panel's left edge and the text is clipped. Keep menus inside the viewport (flip/clamp); check every popover in the right panel | ✅ |
| 5 | **Change notification pings** | Pick the notification sound from built-ins (8-bit and smooth) or upload your own (short, size-capped, stored like soundboard sounds); per type (message, mention, DM, ring), optionally per space/DM; preview button | ✅ `ui/notifications/notificationTones.ts`, `NotificationSoundsCard.tsx` |
| 6 | **Accent colors tied to Shapes** | With Square, scrollbars and other controls use the theme accent; with Rounded they're grey. Shapes must not change colors. Add a separate Appearance toggle for colored controls (scrollbars, borders, focus rings), default on, independent of Shapes. Audit what `pixel.css`/square rules color that rounded doesn't | ✅ Appearance → Colored controls (`data-accent-controls`) |
| 7 | **Rename "DANGER" in settings** | The owner dislikes "DANGER" above Sign out. Neutral heading (e.g. "Session") or none; Sign out keeps its destructive styling | ✅ "Session" |
| 8 | **Call controls in the bottom-left (Discord-style)** | Discord shows above the user bar: the current game, "Voice Connected" + channel name with noise and disconnect buttons, then a row: camera, screen share, activities, soundboard. Build that in the sidebar during a call (click the channel name to open the call), plus mic/headset dropdowns for devices in the user bar | ✅ voice dock actions (`e2e-calls/dock.spec.ts`); mic/headset device dropdowns not done |
| 9 | **Stream preview on hover** | Discord: a voice channel member who is streaming shows a LIVE badge; hovering shows "Streaming Now" with a live thumbnail and a "Watch Stream" button. Same in Meadhall's channel list (thumbnail from a low-rate subscription or a periodic frame; only for people who can see the channel) | ✅ snapshots every 20 s in unencrypted channels (`core/voice/streamPreview.ts`, `e2e-calls/streamPreview.spec.ts`) |
| 10 | **Friends list exactly like Discord** | Home → Friends with Online / All / Pending / Blocked, Add Friend by Matrix ID, incoming/outgoing requests (accept, ignore, cancel), actions (message, call, remove). Matrix has no friends: list in account data (`io.github.peytong.meadhall.friends`), requests as a DM invite carrying a request event; accepting updates both lists. Non-Meadhall users just get a DM invite | ✅ `core/friends/friends.ts`, `ui/friends/FriendsView.tsx` |
| 11 | **Message / add friend from a profile card** | Discord's profile popover: add-friend button, "..." menu, mutual servers, roles, and a "Message @user" box at the bottom that sends a DM. Add the message box (opens or creates the DM and sends) and Add friend / Pending / Friends to Meadhall's profile card | ✅ profile card friend button + message box |
| 12 | **Help button with categorized help** | A ? button in the top bar opening a searchable help center: Getting started, Spaces & channels, Messages, Calls & screen share, Profile & status, Friends, Notifications, Moderation & bots, Privacy & encryption, Settings & looks, Troubleshooting. Content from one source that also feeds #13 | ✅ `ui/help/HelpDialog.tsx` |
| 13 | **"Where everything is" doc for a weak LLM** | `docs/help/` plain, exhaustive guide: one topic per section, exact paths ("Settings → Appearance → Shapes") on desktop and phone, short sentences a very small model can quote. Update it with every UI change (add to §4 working agreements) | ✅ `docs/help/meadhall-help.md` |
| 16 | **Calls across homeservers (multi-SFU) must work** | Owner expects this already works; it doesn't fully (§10 first bullet): we only connect to our own SFU, so people whose membership names another homeserver's SFU (`foci_preferred`/transport) aren't heard by us. Do: for each remote transport in call memberships, get a token via that focus's `/get_token` (or `/sfu/get` with an OpenID token) and open an extra subscribe-only LiveKit connection; merge tracks into the call UI. Test with two Synapse + two LiveKit + two lk-jwt-service locally, and against Element Call | ✅ oldest-membership SFU (`activeCallTransport`); not yet tested with two real homeservers |
| 17 | **Homeserver admin panel = Synapse-Admin parity, plus extras** | Owner's Synapse-Admin screenshots. Sections: **Users** (search; Show guests / deactivated / locked toggles; columns avatar, ID, display name, guest, admin, deactivated, locked, erased, created; bulk select; Create, Export CSV, CSV import; paging) → user page with tabs **User** (display name, password reset "logs out all sessions", user type, Server Administrator, Locked, Deactivated (needs password to reactivate), Erased, created; Save, Delete), **Email/Phone** (threepids), **SSO** (external IDs), **Devices** (list, delete), **Connections** (whois IPs/user agents), **Media** (list, delete), **Rooms** (joined rooms), **Pushers**; header actions Send server notice, Erase user data. **Rooms**, **Users' media** (usage stats), **Reported events**, **Room directory**, **Federation** (destinations: failure ts, last retry, retry interval, last successful stream; failing rows red; Reconnect; destination page Status + Rooms tabs; Export), **Registration tokens**. Extras worth adding: server version/health, purge history, block room, shadow-ban, rate-limit overrides, background updates, event reports resolve | ✅ `core/admin/synapseAdminMore.ts`, `ui/settings/user/admin/AdminSections.tsx`, `e2e/adminSections.spec.ts`. Not done: bulk select, login-as-user |
| 14 | **Later, not v0.5.1: local help LLM** | Optional toggle to download and run a small local model that answers from #13. Plan only (model size, runtime such as WebGPU or llama.cpp, fully local) | later |
| 15 | **Game overlay (Shift+`)** | Like Discord's overlay: hotkey shows over the game a call bar (mic, headset, camera, share, soundboard, effects, disconnect), voice members with speaking rings, recent messages/notifications, pinnable movable widgets for video tiles and screen shares; Esc closes. Desktop only. Transparent always-on-top Electron window works over windowed/borderless games; exclusive fullscreen would need DLL injection, which we won't do (anti-cheat bans). Tell the owner the limits | ✅ `apps/desktop/electron/overlay.ts`, `ui/overlay/` (checked in the real dev app); no draggable widgets or video tiles yet |

## 11. Work log

| Date | Work |
|---|---|
| 2026-10-22 | Forked Heorot; fixed typecheck; MatrixRTC voice verified against Element Call/lk-jwt-service source; desktop updater, tray, login, permissions; Synapse integration + Playwright E2E + CI; release pipeline; security audit and scanning; renamed to Meadhall; standalone repo `PeytonG/Meadhall`; owner's artwork; pixel theme, color wheel, fonts, stickers, Discord-style UI; one-click updates; live audio settings; docs; CodeQL test-tooling fixes; Android release key + secrets (backed up to Documents); Synapse script hang fix; PR #3 merged; old fork deleted; `v0.1.0` released (all 6 jobs green); sign-in resolves the homeserver address (`.well-known`, http→https) before logging in or registering. Then: default server + registration tokens, font picker, round avatars, mute/deafen outside calls, volume boost to 120%, DM/group calls with notifications. Then: Discord-style Home, phone layout (Android Back), voice changer, README screenshots. PR #6 merged; `v0.2.0` released (desktop files re-attached after an electron-builder draft mix-up; release workflow fixed). Then: v0.2.1 (pictures, screen share, campfire); CHANGELOG-driven release notes. Then v0.3.0 work: desktop drag-region fix + themed window controls, quieter campfire with local speech detection, people search, pixel emoji, incoming-call ringtone, roles/permissions, server admin panel, desktop + Android background notifications, much more UI testing (incl. a real Electron test). |
| 2026-10-23 | v0.3.1 backlog (§10.1): ringtone and Windows notifications fixed; status/DND/Away, DM previews, phone icon; profiles (banner, bio, links, roles); talk permissions; tray menu; Steam activity; 12 voice effects; soundboard; several accounts; phone update notice and What's new; high contrast; iOS project; README overhaul with test-made screenshots; admin password reset fixed on desktop; status write races fixed. |
| 2026-10-23 | v0.3.2 (§10.2): soundboard over the mic, volume, trimming and scrolling; call drops (alone timer, rejoin, call history); Steam display; status speed; call card clicks on desktop; taskbar icon and unread bubble; screen share previews and scaling; banner crop; Block / Ignore; earlier versions; CodeQL fixes and a security audit (IPC sender check); read-marker race; component harness for in-call tests and screenshots. |
| 2026-10-23 | v0.3.3 (§10.3): Linux `.rpm`/`.deb` updates via the package manager, `.deb` package, declared deps, GNOME and Windows taskbar icons; verification fix; Unencrypted chip; icon style; Logs and call-ended notice; Report a bug; server notices and group-chat invites; cross-server status ? and Share my status; log redaction. Packages verified in clean Ubuntu 24.04 and Fedora 42 containers. |
| 2026-10-26 | v0.4.0 (§10.5): sound style, soundboard track and volumes, 10 voice effects, notification fixes, deletion placeholders, webcam, push to talk, polls, code blocks and preview privacy, Rich Presence/game detection/MPRIS with audiences, reduce motion and axe checks, translations, QR sign-in, provenance attestations, Flatpak (built in Flathub's CI image) and F-Droid metadata, SignPath plan. Power cut mid-work: repaired a zeroed branch ref. |
| 2026-10-27 | v0.4.1: threads (bot replies via baibot were invisible), inbox mark-read for thread replies, verification fixes (recovery key now cross-signs the session, SAS no longer cancelled by QR generation, no orphaning another app's recovery key). |
| 2026-11-01 | v0.4.2 published. v0.5.0: server bots (apps/bot + Server Settings → Community), UI pass from the owner's design PDF and an iOS guide (tokens, 44 px targets, phone tab bar, drill-in settings, long-press menus), camera preview, logo rebuilt from its pixel grid, stuck Playing status fixed; Android SDK + emulator (Meadhall_Pixel, API 36) installed on the owner's PC. |
| 2026-10-24 | v0.3.4 (§10.4): bug reports visible to the developer; server menus, muting, channel types, banners, rail badges, inbox, update arrow; members by role with role editing; voice channel chat; badges (signed, fingerprinted list); profile style; style profiles and .meadhall sharing; screen share picker fixes; pasted GIFs; calls in channels no longer notify; per-call history; README screenshots. |
