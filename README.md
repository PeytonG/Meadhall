<div align="center">

<img src="apps/desktop/assets/icon.png" alt="Meadhall" width="112" />

# Meadhall

**A pixel-art, Discord-style chat app on the open Matrix protocol.**

[![Latest release](https://img.shields.io/github/v/release/PeytonG/Meadhall?color=a64dff&label=release)](https://github.com/PeytonG/Meadhall/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/PeytonG/Meadhall/total?color=a64dff)](https://github.com/PeytonG/Meadhall/releases)
[![CI](https://github.com/PeytonG/Meadhall/actions/workflows/ci.yml/badge.svg)](https://github.com/PeytonG/Meadhall/actions/workflows/ci.yml)
[![Security](https://github.com/PeytonG/Meadhall/actions/workflows/security.yml/badge.svg)](https://github.com/PeytonG/Meadhall/actions/workflows/security.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-a64dff)](LICENSE)

Windows · Linux · Android · Web · works with Element · end-to-end encrypted · [What's new](CHANGELOG.md)

**[⬇️ Download](#download) · [✨ Features](#features) · [🖼️ Screenshots](#screenshots) · [📝 Signing up](#signing-up) · [🏰 Self-hosting](docs/self-hosting.md) · [🛠️ Development](#development)**

<a href="docs/screenshots/space-roles.png"><img src="docs/screenshots/space-roles.png" alt="Meadhall: a server with channels, a conversation with a pixel sticker, and a member list in role colors" width="900" /></a>

</div>

> [!NOTE]
> Meadhall is a fork of **[Heorot](https://github.com/Vitosicz/Heorot)** and stays compatible with it: servers,
> channels, voice channels and emoji use the same Matrix events, so people on either app can share a server.

> [!IMPORTANT]
> Meadhall is **alpha** software. It's used every day, but features and settings still change between versions.

## 🍺 At a glance

- 🏰 **Servers, channels and DMs like Discord**, on Matrix: sign in with any Matrix account, or host your own.
- 🔒 **End-to-end encrypted** messages and calls, with device verification and key backup.
- 🎙️ **Voice that works with Element Call**: voice channels, DM and group calls, screen sharing.
- 🔥 **Pixel art everywhere**: a pixel theme, pixel emoji and stickers, and a campfire that burns while you talk.
- 🎭 **Roles, statuses and profiles** with banners, bios, links and "Playing ..." from Steam.
- 🖥️ **Every platform**: Windows, Linux, Android and the web, with notifications and self-updating desktop apps.

<a id="download"></a>

## ⬇️ Download

**[Get the latest release →](https://github.com/PeytonG/Meadhall/releases/latest)**

| Platform | File | How to install |
|---|---|---|
| 🪟 **Windows** 10/11 | `Meadhall-Setup-<version>.exe` | Run it. SmartScreen may warn because the app isn't code-signed yet: **More info → Run anyway**. |
| 🎩 **Fedora / RHEL** | `Meadhall-<version>-x86_64.rpm` | See [Installing on Linux](#installing-on-linux). |
| 🐧 **Debian / Ubuntu / Mint** | `Meadhall-<version>-amd64.deb` | See [Installing on Linux](#installing-on-linux). |
| 🐧 **Any Linux** | `Meadhall-<version>-x86_64.AppImage` | See [Installing on Linux](#installing-on-linux). |
| 🤖 **Android** 7+ | `Meadhall-<version>-android.apk` | See [Installing on Android](#installing-on-android) below. |
| 🍎 **iOS (Beta)** | TestFlight | Invite only for now: see [iOS (Beta)](#ios). |
| 🌐 **Web** | — | Use a Meadhall someone hosts, or [host your own](docs/self-hosting.md). |

- **Desktop apps update themselves:** a notice offers **Update now**, then a one-time **What's new** shows what changed.
- **Phones tell you when there's an update** and link straight to it (turn this off in Settings → Updates).
- Every release has a `SHA256SUMS.txt` to check your downloads against.

<a id="installing-on-linux"></a>
<details>
<summary><b>🐧 Installing on Linux</b> (and updating)</summary>

Open a terminal in the folder you downloaded to (usually `cd ~/Downloads`), then:

| Distro | Install |
|---|---|
| **Fedora, RHEL, Nobara** (.rpm) | `sudo dnf install ./Meadhall-*.rpm` |
| **Debian, Ubuntu, Mint, Pop!_OS** (.deb) | `sudo apt install ./Meadhall-*.deb` |
| **Anything else** (AppImage) | Install FUSE 2 once (below), then `chmod +x Meadhall-*.AppImage` and run `./Meadhall-*.AppImage` |

AppImages need the FUSE 2 library, which many current distros no longer install by default (otherwise you'll see
`dlopen(): error loading libfuse.so.2`):

| Distro | Command |
|---|---|
| Fedora | `sudo dnf install fuse-libs` |
| Ubuntu 24.04 and newer | `sudo apt install libfuse2t64` |
| Ubuntu 22.04, Debian, Mint | `sudo apt install libfuse2` |
| Arch, Manjaro | `sudo pacman -S fuse2` |

**Updates:** Meadhall tells you when one is out. With the .rpm or .deb it asks for your password to install it (or
shows the command to run if you'd rather do it yourself); the AppImage replaces itself.

</details>

<a id="installing-on-android"></a>
<details>
<summary><b>🤖 Installing on Android</b> (and updating)</summary>

1. On your phone, open the **[latest release](https://github.com/PeytonG/Meadhall/releases/latest)** and tap the
   `.apk` file to download it.
2. Open the downloaded file. If Android asks, allow your browser (or Files app) to **install unknown apps**.
3. Tap **Install**, then **Open**, and sign in.

To update, do the same with the new APK and tap **Update**: your messages, settings and sign-in stay. Meadhall shows a
notice with a download button when a new version is out.

</details>

<a id="ios"></a>
<details>
<summary><b>🍎 iOS (Beta)</b></summary>

The iPhone app is in **beta** and still being tested. It's installed through Apple's **TestFlight** app rather than
from the releases page: Apple only lets iPhones install apps from the App Store or TestFlight.

1. Ask for an invite (open an issue or ask the maintainer), then install **TestFlight** from the App Store.
2. Open the invite link on your iPhone and tap **Install**.
3. Updates arrive in TestFlight: Meadhall also tells you when one is out, with a button that opens TestFlight.

Notifications while the app is closed aren't available on iPhone yet. Until you have an invite, use Meadhall on the
web in Safari, or [Element](https://element.io) for iPhone: you'll be in the same servers and calls.

</details>

<a id="features"></a>

## ✨ What it does

**Feels like Discord**
- 🏰 **Servers and channels** (Matrix spaces and rooms) with categories, drag-and-drop ordering and channel settings.
  Channel types (text, voice, rules, FAQ, news, events) with pixel icons, server banners, unread counts on channels
  and server icons, and right-click menus to mark as read, mute, change notifications, reorder servers or set a
  per-server nickname.
- 📥 An **inbox** of everything unread (or just your mentions), and a download arrow when an update is out.
- 💬 **Direct messages and group chats** on Home, with the latest message and each person's status under their name.
- 🎭 **Roles**: colored roles with moderation powers, channels only some roles **can see**, and channels only a role
  and above **can talk** in. They're Matrix power levels, so the server enforces them, in Element too. The member
  list groups people by role, highest rank first, and admins change roles right from it.
- 🟢 **Status**: Online, Away, Do Not Disturb, Invisible and a custom status. You go Away after 10 minutes without
  input, people on the phone app show a 📱, and the desktop app shows **"Playing ..."** for games running in Steam.
  People whose server doesn't share status show a **?**, and you can stop sharing yours in Settings → Privacy.
- 🪪 **Profiles** with a banner (image or GIF, cropped to fit), About me, links, and the person's roles in every server
  you share, a **card gradient** and a **nameplate** behind your name in member lists, and **badges** (founding members
  of Meadhall wear a gold coin). **Block** anyone from their profile.
- 👥 **Multiple accounts**: sign in to accounts on different servers, switch from the user panel, and get
  notifications for all of them.
- ↩️ Replies, edits, reactions, pins, read receipts, typing indicators, search and a member list.

**Voice and calls**
- 🎙️ **MatrixRTC with LiveKit**, the same as Element Call, so Meadhall and Element users share calls.
- 🔊 Voice channels are **hangouts**: click to join, no ringing. DMs and group chats have calls that **ring** with an
  8-bit ringtone.
- 🔥 A pixel **campfire** burns around whoever is talking, in their color (or a simple ring, if you prefer).
- 🎛️ A **voice changer** with 18 effects (Giant, Pixie, Robot, Dragon, Ghost, Cave, Underwater, Alien, Choir...).
- 📯 A **soundboard** with 12 built-in 8-bit sounds and up to 24 of your own (trim them to fit), played over your mic.
- 🖥️ Screen sharing with **previews** of what you can share, several streams side by side, per-person volume up to 120%,
  mute and deafen any time.
- 💬 Voice channels can have **text chat** beside the call. Calls in a server's channels never ring everyone.
- 🔁 Dropped calls **rejoin by themselves**. If a call ends without you choosing to, Meadhall tells you why, and
  Settings → Logs keeps the history.

**Pixel art**
- 🎨 A hand-made pixel theme. The **pixel color wheel** recolors the whole app; dark, light and **high contrast** themes.
- 😀 Pixel emoji, pixel stickers, custom emoji packs per server and per person, and pixel fonts (or any font you have).
- 🧱 Pixel-art icons, or smooth ones if you prefer (Settings → Appearance).
- 🎁 **Style profiles**: save your look and switch between looks. Turn on **Sharing** to send friends your soundboard
  sounds and styles; they add them with one click (or as `.meadhall` files).

**Yours**
- 🔒 End-to-end encryption by default (Matrix Rust crypto), device verification, key backup and recovery. Rooms
  without it are marked **Unencrypted** in red.
- 🙈 No analytics, no telemetry. Run your own server or use any Matrix homeserver.
- 🛡️ Server admins get an **admin panel**: invite tokens, new accounts, password resets and **server notices**.
- 🐞 **Report a bug** from Settings: it goes to the developer as a message from your account, with a screenshot and
  your logs if you want, and stays out of your chats.
- 🔔 Notifications on desktop (from the tray too: Mute, Deafen and Status are in the tray menu, and the taskbar icon
  shows an unread bubble) and on Android in the background, with no Google account needed.
- ⏪ Desktop apps can **go back to an earlier version** from Settings → Updates if an update causes trouble.

<a id="screenshots"></a>

## 🖼️ Screenshots

### New in v0.3.4

<a href="docs/screenshots/server-features.png"><img src="docs/screenshots/server-features.png" alt="A server with a banner, channel types, unread counts, members grouped by role with nameplates, and the founder coin" width="900" /></a>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/server-menu.png"><img src="docs/screenshots/server-menu.png" alt="The server right-click menu" /></a></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="docs/screenshots/inbox.png" alt="The inbox" /></a></td>
</tr>
<tr>
<td><b>Right-click a server:</b> mark as read, mute, notifications, hide muted channels, nickname, move, leave.</td>
<td><b>Inbox:</b> every unread message (or only mentions), grouped by conversation.</td>
</tr>
<tr>
<td><a href="docs/screenshots/profile-style.png"><img src="docs/screenshots/profile-style.png" alt="A profile card with a gradient and the founder coin" /></a></td>
<td><a href="docs/screenshots/profile-style-settings.png"><img src="docs/screenshots/profile-style-settings.png" alt="Choosing a card gradient and nameplate" /></a></td>
</tr>
<tr>
<td><b>Profile cards</b> with a gradient, and badges after names.</td>
<td><b>Profile style:</b> 10 gradients or your own colors, drawn in pixel bands.</td>
</tr>
<tr>
<td><a href="docs/screenshots/sharing.png"><img src="docs/screenshots/sharing.png" alt="A shared soundboard sound in a chat" /></a></td>
<td></td>
</tr>
<tr>
<td><b>Sharing:</b> a friend's sound arrives as a card; play it, then Adopt.</td>
<td></td>
</tr>
</table>

### Everything else

<table>
<tr>
<td width="50%"><a href="docs/screenshots/direct-messages.png"><img src="docs/screenshots/direct-messages.png" alt="Direct messages" /></a></td>
<td width="50%"><a href="docs/screenshots/profile.png"><img src="docs/screenshots/profile.png" alt="A profile" /></a></td>
</tr>
<tr>
<td><b>Direct messages:</b> status and the latest message under every name.</td>
<td><b>Profiles:</b> banner, About me, links and roles in mutual servers.</td>
</tr>
<tr>
<td><a href="docs/screenshots/campfire.png"><img src="docs/screenshots/campfire.png" alt="The speaking campfire on and off" /></a></td>
<td><a href="docs/screenshots/status-menu.png"><img src="docs/screenshots/status-menu.png" alt="The status menu" /></a></td>
</tr>
<tr>
<td><b>Speaking campfire:</b> flames while you talk, or a simple ring.</td>
<td><b>Status:</b> custom status, Online, Away, Do Not Disturb, Invisible and your other accounts.</td>
</tr>
<tr>
<td><a href="docs/screenshots/soundboard-call.png"><img src="docs/screenshots/soundboard-call.png" alt="The soundboard in a call" /></a></td>
<td><a href="docs/screenshots/screen-share.png"><img src="docs/screenshots/screen-share.png" alt="Two screen shares side by side" /></a></td>
</tr>
<tr>
<td><b>Soundboard:</b> built-in 8-bit sounds and your own, played over your mic.</td>
<td><b>Screen sharing:</b> several streams side by side, sized to fit the window.</td>
</tr>
<tr>
<td><a href="docs/screenshots/screen-share-picker.png"><img src="docs/screenshots/screen-share-picker.png" alt="Choosing what to share, with previews" /></a></td>
<td><a href="docs/screenshots/soundboard-trim.png"><img src="docs/screenshots/soundboard-trim.png" alt="Trimming a sound" /></a></td>
</tr>
<tr>
<td><b>Pick what to share</b> from previews of every screen and window.</td>
<td><b>Trim your own sounds</b> to the part you want, up to 8 seconds.</td>
</tr>
<tr>
<td><a href="docs/screenshots/roles-editor.png"><img src="docs/screenshots/roles-editor.png" alt="The roles editor" /></a></td>
<td><a href="docs/screenshots/channel-access.png"><img src="docs/screenshots/channel-access.png" alt="Channel access by role" /></a></td>
</tr>
<tr>
<td><b>Roles:</b> colors, ranks and moderation powers.</td>
<td><b>Channel access:</b> who can see and who can talk, per channel.</td>
</tr>
<tr>
<td><a href="docs/screenshots/chat-light.png"><img src="docs/screenshots/chat-light.png" alt="Light theme" /></a></td>
<td><a href="docs/screenshots/chat-high-contrast.png"><img src="docs/screenshots/chat-high-contrast.png" alt="High contrast theme" /></a></td>
</tr>
<tr>
<td><b>Light theme</b>, recolored with the pixel color wheel.</td>
<td><b>High contrast:</b> every piece of text at least 7:1 (WCAG AAA).</td>
</tr>
<tr>
<td><a href="docs/screenshots/sign-up-token.png"><img src="docs/screenshots/sign-up-token.png" alt="Signing up with a registration token" /></a></td>
<td><a href="docs/screenshots/phone.png"><img src="docs/screenshots/phone.png" alt="Meadhall on a phone" /></a></td>
</tr>
<tr>
<td><b>Signing up</b> on a server that uses registration tokens.</td>
<td><b>On your phone:</b> your conversations, then the chat. Swipe to go back.</td>
</tr>
</table>

**[All screenshots →](docs/SCREENSHOTS.md)**

<a id="signing-up"></a>

## 📝 Signing up

Meadhall signs in to any Matrix homeserver. The app suggests `https://matrix.org`; type your own server's address
to use it. How you create an account depends on how that server is set up, and Meadhall's **Register** tab follows
whatever the server asks for:

| How the server is set up | What you'll see in Meadhall | Synapse setting |
|---|---|---|
| **Open sign-up** | Username, password, done. | `enable_registration: true` with `enable_registration_without_verification: true` |
| **Invite codes** (registration tokens) | A **Registration token** field: enter the code the admin gave you. | `registration_requires_token: true`; admins make tokens in Meadhall's **Server admin** panel |
| **Email verification** | An **Email** field; click the link in the email, then come back. | `registrations_require_3pid: [email]` plus an `email:` section |
| **CAPTCHA** | A "prove you're human" step. | `enable_registration_captcha: true` with reCAPTCHA keys |
| **Terms of service** | A checkbox to accept the server's terms. | `user_consent` / terms policy |
| **Single sign-on** (Google, GitHub, company login...) | **Continue with SSO**: finish on the provider's page and come back signed in. | `oidc_providers` / `sso`, or Matrix Authentication Service |
| **Closed** (accounts made by the admin) | Registration is off: ask the admin, who creates your account in **Server admin**. | `enable_registration: false` |

**matrix.org** uses its own account service: Meadhall signs in there with your password, and **Register** takes you to
matrix.org's sign-up page (single sign-on), which asks for an email and a CAPTCHA. Servers can combine several of
the steps above (for example a token **and** an email). See [docs/self-hosting.md](docs/self-hosting.md) for the
full server setup.

## 🚪 First steps

1. **Sign in** (or [sign up](#signing-up)). A fresh account may offer **secure backup**: set it up and keep the
   key safe, it unlocks your encrypted history on new devices.
2. **Make a server** with **+** in the left rail, add text and voice channels, and invite friends.
3. **Join a voice channel** by clicking it. Settings → Audio has your devices, the voice changer and the soundboard.
4. **Make it yours** in Settings: profile banner and bio, theme color, fonts, and your status from the user panel.

## 🏰 Self-hosting

Meadhall is a static web app that talks to a Matrix homeserver. For the full setup (homeserver, the web app, and
the LiveKit voice backend shared with Element Call), see **[docs/self-hosting.md](docs/self-hosting.md)**.

```bash
git clone https://github.com/PeytonG/Meadhall.git && cd Meadhall
pnpm install
cp apps/web/config.example.json apps/web/config.json   # point default_server_config at your homeserver
pnpm build:web                                         # static files in apps/web/dist/ (serve with any web server)
```

<a id="development"></a>

## 🛠️ Development

**Requirements:** Node.js 22+, pnpm 10, and Docker for the integration and end-to-end tests.

```bash
pnpm install
pnpm dev:web                 # web app at http://localhost:5173
pnpm dev:desktop             # Electron desktop app
pnpm typecheck
pnpm --dir apps/web test     # unit tests
```

| Tests | Command | What it covers |
|---|---|---|
| Unit | `pnpm --dir apps/web test` | Logic: roles, presence, voice helpers, theme engine, updates and more |
| Smoke | `pnpm --dir apps/web test:smoke` | The voice room with a simulated call (E2EE, soundboard, screen shares) |
| Integration | `node scripts/test-synapse.mjs start` then `pnpm --dir apps/web test:integration` | Real Synapse (room versions 11 and 12): roles, imports, MatrixRTC, encrypted key exchange |
| End-to-end | `pnpm --dir apps/web test:e2e` (Synapse running) | The real app in Chromium, desktop and phone sizes |
| Desktop | `pnpm --dir apps/desktop run build` then `pnpm --dir apps/web exec playwright test -c playwright.desktop.config.ts` | The real Electron app: notifications, tray, updates |

All of these run on every push in [GitHub Actions](.github/workflows/ci.yml), alongside
[security scanning](.github/workflows/security.yml) (CodeQL, dependency review, gitleaks, `pnpm audit`,
Electronegativity). The README screenshots are made by tests too: `CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec
playwright test screenshots`.

| Path | What's there |
|---|---|
| `apps/web` | The app: React 19, Vite, matrix-js-sdk, LiveKit |
| `apps/desktop` | Electron wrapper: tray, updates, notifications, Steam activity |
| `apps/mobile` | Android and iOS (Beta) apps (Capacitor); iOS builds on Codemagic (`codemagic.yaml`) |
| `branding/`, `scripts/` | Source artwork, icon and sticker generators, the test homeserver |
| `CLAUDE.md` | Architecture notes, decisions and their reasons, for humans and AI agents |

**Releasing** (maintainers): add a `## vX.Y.Z (date)` section to [CHANGELOG.md](CHANGELOG.md) (it becomes the release
notes and the in-app **What's new**), then push the tag. The [release workflow](.github/workflows/release.yml)
builds Windows, Linux and Android and publishes them with checksums once every build has succeeded.

## ⚠️ Known limitations

- **Push notifications** (when the app isn't running at all) aren't implemented. The desktop app keeps notifying from
  the tray, and Android checks in the background.
- **Calls across homeservers:** Meadhall uses the voice server (SFU) of its own homeserver. Element users publishing
  on another homeserver's SFU can hear you, but you won't hear them yet.
- **Voice needs UDP** access to LiveKit (or a TURN server).
- The Windows app isn't code-signed yet, and the **iOS app is a beta** (TestFlight invites, no notifications while closed).

## 🗺️ Roadmap

- iOS (Beta) → public release, with notifications
- Calls across homeservers (multi-SFU)
- Push notifications
- More sticker packs, and sticker packs per server

## 🤝 Contributing

Issues and pull requests are welcome: read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. Please report security issues
privately as described in **[SECURITY.md](SECURITY.md)**.

## 📜 Credits and license

- **[Heorot](https://github.com/Vitosicz/Heorot)** by Vitosicz, which Meadhall is a fork of (Heorot is the great
  mead-hall in *Beowulf*, hence the name). Parts of Heorot derive from **[Element Web](https://github.com/element-hq/element-web)**.
  See [NOTICE](NOTICE) for what this fork changed.
- **[matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)** (Apache 2.0) and
  **[LiveKit](https://github.com/livekit/client-sdk-js)** (Apache 2.0).
- Fonts: **Pixelify Sans** and **Silkscreen** (SIL Open Font License 1.1).

Meadhall is licensed under the **[GNU AGPL-3.0](LICENSE)**. If you host a modified Meadhall for others, you must offer
them its source (set `source_code_url` in `config.json`).
