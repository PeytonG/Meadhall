<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Meadhall in Rust: effort and benefits

Written 2026-11-10 for the owner's question "explore the effort and benefits of converting Meadhall to Rust".
Research only; nothing in the app changed.

## Short answer

**Don't rewrite Meadhall in Rust.** Instead, adopt Rust where it pays off: the Matrix Rust SDK underneath, and a
smaller desktop shell. Do it in stages, without stopping feature work.

A full rewrite would take one developer about a year or more, during which Meadhall would gain nothing new and two
apps would need keeping alive. Most of the gains people expect from Rust (speed, low memory, fewer crashes) come from
two pieces, the Matrix SDK and the desktop shell, and both can be swapped on their own.

## What Meadhall is today

| Part | Size | Built with |
|---|---|---|
| The app (all platforms) | ~61,000 lines of TypeScript/React, ~14,600 lines of CSS | React, matrix-js-sdk 40, livekit-client |
| Desktop shell | ~2,400 lines | Electron 44 |
| Android/iOS shell | 7 Java files plus the Xcode project | Capacitor |
| Bot | ~650 lines | Node, matrix-js-sdk |
| Tests | ~12,600 lines | Playwright, Vitest |

The heavy, risky parts (end-to-end encryption) already run Rust: matrix-js-sdk uses the Rust crypto library compiled
to WebAssembly (`@matrix-org/matrix-sdk-crypto-wasm`).

## What a rewrite would mean

The UI is most of the code, so "Meadhall in Rust" has three possible meanings:

1. **Everything in Rust, including the UI** (Dioxus, Slint, egui or Iced). This means rebuilding ~61k lines of UI and
   the pixel/smooth themes from scratch. The Rust UI toolkits are young: accessibility, text input methods (IMEs),
   rich text and emoji are weaker than in a browser, and phones are less mature still. The effort is the largest
   (≈ 12–18 months for one person) and carries the most risk of a worse app.
2. **Rust core, web UI kept** (Tauri 2 instead of Electron and Capacitor; matrix-rust-sdk for sync, rooms and
   timelines, exposed to the UI). The UI stays React. Every place the UI talks to matrix-js-sdk (hundreds of call
   sites) moves to the Rust SDK's API, which is shaped differently: room lists, timelines and sliding sync are
   reactive streams, not the JS SDK's event objects. ≈ 6–9 months.
3. **Swap pieces gradually** (recommended, below).

## Element's experience (the closest comparison)

Element is moving Element Web onto the Matrix Rust SDK (talk at The Matrix Conference 2026, written up on 2026-10-29:
"A faster, rustier Element Web"). Their findings apply directly:

- They **ruled out a rewrite**. Moving their mobile apps to Element X took multiple years. A web rewrite would mean
  freezing features or building everything twice, plus migrating users.
- Just moving Element Web's **encryption to Rust took over two years**, and was "at least five times" more
  complicated than expected.
- What works for them: the UI is split from the SDK with view models (MVVM), so each screen can run on either SDK.
  They convert a screen whenever they touch it anyway.
- Only one SDK can sync at a time. Once one SDK has received events, the server won't send them to the other, so
  the switch happens per account (or per build), not per screen at runtime.
- The Matrix Rust SDK is production-ready (Element X on iOS and Android runs on it) and has bindings for other
  languages (`matrix-sdk-ffi`).

## Benefits, and what actually delivers them

| Benefit | What brings it | Needs a rewrite? |
|---|---|---|
| Faster start, big accounts load instantly | Sliding sync (MSC4186) in the Rust SDK; Meadhall has avoided sliding sync because js-sdk 40 lacks presence over it (CLAUDE.md §10.5) | No: Rust SDK underneath |
| Less memory, smaller download | Tauri uses the system webview instead of shipping Chromium (installer ~10 MB instead of ~110 MB) | No: swap the desktop shell |
| Fewer encryption bugs ("unable to decrypt") | The Rust SDK's crypto and its key backup handling, already shared with Element X | No: Rust SDK underneath |
| Lost room state (the MSC4222 problems Meadhall works around in `stateCatchUp.ts`) | The Rust SDK's state handling | No: Rust SDK underneath |
| Memory safety in native code | Only the desktop shell and Android plugin are native today, ~2,500 lines | Small part |
| One codebase for phone and desktop | Already true: one React app in Electron and Capacitor | No |

Costs and risks of moving:

- **Calls:** livekit-client (web) works in Tauri's webviews. LiveKit's Rust SDK exists, but the call UI, screen
  share and E2EE key handling would need redoing; keep calls in the web layer.
- **Webview differences:** Tauri uses WebView2 on Windows, WebKitGTK on Linux and WKWebView on macOS. WebKitGTK and
  WKWebView lag Chromium (screen share, WebRTC codecs, the overlay's transparency). Electron gave Meadhall one
  engine everywhere; the overlay and screen-share picker would need retesting on each.
- **Two SDKs at once:** while screens move over, both SDKs ship (bigger download) and only one may sync.
- **The bot** gains little from Rust (it's tiny); leave it.

## Recommended path

1. **Now (cheap):** keep pulling logic out of components into the `core/` layer and view-model hooks (Meadhall
   already does this for notes, moderation and voice), so the UI depends less on matrix-js-sdk objects. Do this when
   touching a screen anyway, like Element does.
2. **Desktop shell, about 1–2 months:** prototype Tauri 2 beside Electron. Port the main-process features (tray,
   overlay window, notifications, global shortcuts, Steam and game detection, updater, screen-share picker) to
   Tauri's Rust side. Ship it only if the overlay and screen sharing work on all three systems. Gains: ~100 MB
   smaller installer, less memory.
3. **Rust SDK underneath, several months, in steps:** first the room list and timeline (the biggest speed win, with
   sliding sync), then the rest. Wait until the Rust SDK's WebAssembly/web build is stable for web clients (Element
   says putting it into Element Web is their "next big milestone") so Meadhall rides the same path instead of
   maintaining its own bindings.
4. **Phones:** keep Capacitor until step 3 is done, then consider Tauri mobile or native shells around the same
   Rust core.

## Effort summary

| Option | Rough effort (one developer) | Risk | Main gain |
|---|---|---|---|
| Full rewrite, Rust UI | 12–18 months | High: a worse app for a long time | Pure Rust |
| Rust core + web UI (Tauri + Rust SDK) in one go | 6–9 months | Medium–high | Speed, size |
| Staged (shell first, SDK screen by screen) | 1–2 months for the shell, then gradual | Low | Same gains, no feature freeze |

Estimates are rough and assume today's codebase size. They don't include re-testing every feature on every platform,
which a rewrite would need from scratch.
