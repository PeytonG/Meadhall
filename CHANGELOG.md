# Changelog

What changed in each Meadhall release, written for the people using it. The release workflow publishes the section
for each version tag as that release's notes, so every release needs a section here before it is tagged.
Versions follow `vX.Y.Z`.

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
