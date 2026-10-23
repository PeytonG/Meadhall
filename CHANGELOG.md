# Changelog

What changed in each Meadhall release, written for the people using it. The release workflow publishes the section
for each version tag as that release's notes, so every release needs a section here before it is tagged.
Versions follow `vX.Y.Z`.

## Unreleased

### New
- **High contrast theme** (Settings → Appearance) for people who find the other themes hard to see: black
  background, white text, bold outlines, a yellow focus ring, and your accent color brightened to stay readable.
- **Phones: a send button** next to the emoji button, and **swipe** right to go back to your conversations (left to
  return to the chat).
- **Set your status** from the user panel, like Discord: Online, Idle, Do Not Disturb, Invisible, and a custom status
  message. Do Not Disturb silences notifications and call ringing. Online status now works in the web and Android
  apps too, not only on desktop.
- **Tray menu (Windows and Linux):** Mute, Deafen and your status (Automatic, Online, Away, Do Not Disturb,
  Invisible) right from the tray icon; it stays in step with the app.
- **Automatic Away:** with the Automatic status you show as Away after 10 minutes without input (anywhere on the
  computer, in the desktop app) and go back to Online as soon as you return. "Idle" is now called "Away".
- **12 new voice changer effects:** Chipmunk, Dragon, Dwarf, Ghost, Cave, Underwater, Alien, Telephone, Megaphone,
  Choir, Wobble and Bard.
- **Profile banner, About me, email and links:** upload an image or GIF banner and add a bio, a public email and up to
  five links in Settings → Profile; they show on your profile card.
- **Profiles show roles in mutual servers:** each server you share, by name, with the person's role chips in their
  colors (or Admin / Moderator on servers without Meadhall roles).
- **Direct Messages show the latest message** under each name, next to their status.
- People on the **phone app** show a green phone instead of the online dot, unless they picked a status.
- **Two screen shares at once show side by side**; click one to watch it large, and "Show all" to go back.
- **Calls end themselves after 5 minutes alone**, with a note saying why, so a forgotten call doesn't keep your
  microphone open.

### Changed
- The app connects to **matrix.org** by default again; type your own server's address to use it.

### Fixed
- **Your own profile picture shows in calls** (it was missing when you had a display name set, and before the call
  finished connecting).
- **Transparent pictures stay transparent:** PNGs and GIFs no longer get a gray box behind them.
- **Notifications show in the Windows and Linux apps.** They now use the system's own notifications, and are switched
  on once for existing installs (an old "off" default had been saved with everyone's settings).
- **Calls ring again.** In encrypted DMs (the default) the call notice arrives encrypted, so incoming calls never rang.
  The desktop app also plays the ringtone even if you haven't clicked in it yet (for example after starting at
  login).

## v0.3.0 (2026-10-23)

### New
- **Android notifications in the background**, with no Google account or extra app: Meadhall stays connected (Android
  shows a quiet "Meadhall is connected" notification) and notifies you of messages and calls, including after the
  phone restarts. Encrypted messages show as "New message". Sign out and back in once after updating so the
  background connection gets a lasting sign-in.
- **Notifications are on by default** in the desktop app. Clicking one brings Meadhall back (even from the tray) and
  opens that conversation, and incoming calls notify you while Meadhall is in the background.
- **Roles and permissions, Discord-style.** In Server Settings → Members, create roles (name, color, rank,
  permissions such as kick, ban, manage messages, manage channels), give them to people, and make channels private
  to certain roles. Names show in their role's color. Roles become Matrix power levels and invite-only channels, so
  the server enforces them for everyone, Element users included. Higher roles can do everything lower roles can.
- **Server admin panel** (Settings → Server admin, only for server admins): create and delete registration tokens
  (invite codes, with use limits and expiry), create accounts, reset passwords, make admins and deactivate accounts:
  no need for the separate Synapse admin page.
- **Incoming calls ring.** When someone calls you in a DM or group chat, a "Bob is calling" card appears with Join and
  Dismiss, and an 8-bit Meadhall ringtone plays. Only the person being called hears it, never the caller. One-to-one
  calls also ring in Element.
- **Pixel emoji.** Emoji are drawn as pixel art to match the app (they stay normal, copyable text). Turn it off in
  Settings → Appearance → Emoji.

### Fixed
- **The desktop app takes every click and scroll again.** Nearly the whole window was marked as a "drag the window"
  area, which swallowed clicks and scrolling: the color wheels didn't respond, Settings and call panels scrolled
  badly, and menu items only worked in certain spots. Now only the title bars drag the window.
- **The minimize/maximize/close buttons match the theme** (dark, light and any color) instead of a fixed dark strip.
- **Smoother scrolling** everywhere: scrolling a panel no longer drags the page behind it.

### Changed
- **People search matches names.** Finding someone to message now matches their display name, username or full ID,
  in any word order and ignoring accents ("gnad pey" finds Peyton Gnadinger). People you share rooms with appear
  instantly as you type.
- **The speaking campfire is smaller and only rises from the top of the picture**, so it never covers names, and it
  lights up much faster when someone starts talking (measured on your device instead of waiting for the server).

## v0.2.1 (2026-10-22)

### New
- **Speaking campfire.** While someone talks in a call, a pixel campfire burns around their picture instead of the
  green ring. Pick your fire's color, or turn it off to keep the green ring, in Settings → Audio. Everyone in the
  call sees each person's choice.

### Fixed
- **Pictures show up again.** On servers that require signed media downloads (the Meadhall server does), pictures
  sent a few minutes after signing in appeared as broken images in the desktop app. The app now keeps its media
  sign-in current, and falls back to downloading a picture directly if it still fails to load.
- **Smooth screen sharing.** Shared screens ran at about 3 frames per second whatever quality was picked. They now
  run at the chosen rate (measured: 1080p at about 57 fps for the 60 fps setting, 720p at 30 fps).

## v0.2.0 (2026-10-22)

### New
- **Home, like Discord.** The Meadhall icon at the top of the server list opens your **Direct Messages**, with
  **Group Chats** underneath. Each shows who's online, unread counts, member counts and who's in a call, and you can
  search your conversations.
- **Calls in DMs and group chats.** Press the phone button at the top of a conversation, or **Call** on someone's
  profile. Nobody has to answer: the call stays open while anyone is in it. The others get a notification (it never
  rings) and a "Join call" bar. Element users see and can join the same call.
- **Voice changer:** Giant, Pixie, Robot, Great hall, Radio and Troll. Everyone in the call hears it, Element users
  included. Switch it mid-call, or try it first with **Hear yourself** in Settings → Audio.
- **Turn people up to 120%** with their volume slider, for quiet microphones.
- **Mute and deafen any time**, in or out of a call. You join calls the way you left them, and deafening also mutes
  you.
- **Fonts:** choose Pixel, Pixel headings, System, or any font installed on your device (Settings → Appearance).
- **Registration tokens.** If a server needs an invite token to sign up (the Meadhall server does), the Register form
  asks for it and checks it before creating the account.
- **Phones and tablets.** The Android app works like Discord's: your servers and conversations on one screen, the
  chat on the next, and the Back button takes you back. On smaller screens the member list slides over the chat when
  you open it, Settings fill the screen, and the message box stays above the keyboard.

### Changed
- The app now connects to the Meadhall server (`https://elementprojectzkypg.duckdns.org`) by default.
- Profile pictures are round.
- Server text channels no longer show a call button (calls there happen in voice channels, as in Discord).

### Fixed
- Signing in with `http://` or with a domain that points to another server no longer fails with "Failed to fetch":
  the app finds the server's real address first, like Element does.
- Group chats created in Meadhall let every member join their calls (before, only moderators could).

## v0.1.0 (2026-10-22)

The first Meadhall release, based on Heorot.

### New
- **Meadhall**: a new name, artwork and a pixel-art look throughout, with a bright purple theme you can recolor with
  the pixel color wheel, and pixel stickers you can send in any chat.
- **Voice that works with Element Call.** Voice channels use MatrixRTC, so Meadhall and Element users share calls,
  with end-to-end encrypted media in encrypted rooms. Calls are persistent: click to join, no ringing.
- **Change audio settings mid-call** (microphone, speaker, noise suppression, echo cancellation) without leaving.
- **Desktop app** for Windows and Linux (AppImage and Fedora `.rpm`): runs in the tray, can start at login, and
  **updates itself**: a notification offers "Update now", then downloads, installs and restarts.
- **Android app** (APK).
- A Discord-style user panel, "Voice Connected" panel, date dividers and an online/offline member list.
