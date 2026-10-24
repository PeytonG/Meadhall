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
  (`e2e/voiceEffects.spec.ts`, `e2e/soundboard.spec.ts`); the voice room smoke tests fake LiveKit (no LiveKit in CI).
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
- 18 effects built from standard Web Audio nodes (pitch-shift delay lines, vibrato, multi-tap echoes, filters,
  ring modulation, wave shaping) so they run everywhere; each is measured in Chromium (audible, no clipping,
  changed, pitch effects within 8%).
- Soundboard: 12 built-ins **synthesized** in an 8-bit style (`voice/soundboard/builtinSounds.ts`), so there are no
  sample files or licenses. Your own sounds (≤ 8 s, 1 MB, decodable) go to the media repo and are listed in account
  data `io.github.peytong.meadhall.soundboard`. In a call they are **mixed into the microphone**: they play into
  `voiceChanger.soundboardBus(context)`, which Meadhall's mic processor (the voice changer's, kept as a straight wire
  when there's no effect) mixes into what it sends. So sounds go out as your voice and light your speaking indicator
  (the VAD follows the processed track). v0.3.1 published a separate track instead; LiveKit reported it as
  "publishing silence" between sounds and it didn't count as talking, so v0.3.2 switched (owner's request). Needs an
  unmuted mic. Volume 0-100 in audio settings. No cooldown yet.
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

### 7.16 Accessibility
High contrast theme (`data-theme="contrast"`): pure black/white, white outlines, yellow focus ring, accent
brightened to 7:1. `e2e/contrast.spec.ts` walks every visible text node and requires 7:1 against its background
(the same audit flags 16 texts in the dark theme, so it has teeth).

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

## 10. Open issues and roadmap

- **Multi-SFU calls:** we only connect to our own SFU, so Element users publishing on another homeserver's SFU aren't
  heard (they hear us). Needs one LiveKit subscriber connection per remote transport (`/get_token`).
- **Matrix 2.0 mode:** js-sdk 40.2 hashes `user|device|member`; lk-jwt-service hashes JSON. Upgrade matrix-js-sdk
  (44+) before Element Call makes that mode the default.
- MSC4195 `url`-only transports aren't supported yet (falls back to the relay).
- iOS needs a first real build (Apple Developer account + Codemagic key) and APNs/Sygnal for notifications; code
  signing for Windows/macOS; optional FCM push for Android (needs the owner's Firebase project + Sygnal).
- Notification taps on Android open the app but not yet the specific conversation (the intent carries `roomId`).
- Android's background service only covers the active account (§7.12).
- No OIDC-native sign-in (Matrix Authentication Service). matrix.org uses MAS: password sign-in works through its
  compatibility layer and Register falls back to its SSO page (checked against matrix.org on 2026-10-23).
- Soundboard has no cooldown; "talk" permissions are ranked (role and above), not exact sets (§7.6).

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

## 11. Work log

| Date | Work |
|---|---|
| 2026-10-22 | Forked Heorot; fixed typecheck; MatrixRTC voice verified against Element Call/lk-jwt-service source; desktop updater, tray, login, permissions; Synapse integration + Playwright E2E + CI; release pipeline; security audit and scanning; renamed to Meadhall; standalone repo `PeytonG/Meadhall`; owner's artwork; pixel theme, color wheel, fonts, stickers, Discord-style UI; one-click updates; live audio settings; docs; CodeQL test-tooling fixes; Android release key + secrets (backed up to Documents); Synapse script hang fix; PR #3 merged; old fork deleted; `v0.1.0` released (all 6 jobs green); sign-in resolves the homeserver address (`.well-known`, http→https) before logging in or registering. Then: default server + registration tokens, font picker, round avatars, mute/deafen outside calls, volume boost to 120%, DM/group calls with notifications. Then: Discord-style Home, phone layout (Android Back), voice changer, README screenshots. PR #6 merged; `v0.2.0` released (desktop files re-attached after an electron-builder draft mix-up; release workflow fixed). Then: v0.2.1 (pictures, screen share, campfire); CHANGELOG-driven release notes. Then v0.3.0 work: desktop drag-region fix + themed window controls, quieter campfire with local speech detection, people search, pixel emoji, incoming-call ringtone, roles/permissions, server admin panel, desktop + Android background notifications, much more UI testing (incl. a real Electron test). |
| 2026-10-23 | v0.3.1 backlog (§10.1): ringtone and Windows notifications fixed; status/DND/Away, DM previews, phone icon; profiles (banner, bio, links, roles); talk permissions; tray menu; Steam activity; 12 voice effects; soundboard; several accounts; phone update notice and What's new; high contrast; iOS project; README overhaul with test-made screenshots; admin password reset fixed on desktop; status write races fixed. |
| 2026-10-23 | v0.3.2 (§10.2): soundboard over the mic, volume, trimming and scrolling; call drops (alone timer, rejoin, call history); Steam display; status speed; call card clicks on desktop; taskbar icon and unread bubble; screen share previews and scaling; banner crop; Block / Ignore; earlier versions; CodeQL fixes and a security audit (IPC sender check); read-marker race; component harness for in-call tests and screenshots. |
| 2026-10-23 | v0.3.3 (§10.3): Linux `.rpm`/`.deb` updates via the package manager, `.deb` package, declared deps, GNOME and Windows taskbar icons; verification fix; Unencrypted chip; icon style; Logs and call-ended notice; Report a bug; server notices and group-chat invites; cross-server status ? and Share my status; log redaction. Packages verified in clean Ubuntu 24.04 and Fedora 42 containers. |
| 2026-10-24 | v0.3.4 (§10.4): bug reports visible to the developer; server menus, muting, channel types, banners, rail badges, inbox, update arrow; members by role with role editing; voice channel chat; badges (signed, fingerprinted list); profile style; style profiles and .meadhall sharing; screen share picker fixes; pasted GIFs; calls in channels no longer notify; per-call history; README screenshots. |
