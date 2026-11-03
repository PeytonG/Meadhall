# Changelog

What changed in each Meadhall release, written for the people using it. The release workflow publishes the section
for each version tag as that release's notes, so every release needs a section here before it is tagged.
Versions follow `vX.Y.Z`.

## v0.5.3 (unreleased)

### New
- **Move around zoomed pictures:** in the picture viewer, click where you want to zoom in or use the mouse wheel,
  drag to move a zoomed picture, pinch on phones; a click without dragging zooms back out. Download saves the picture
  (to Downloads on Android).

### Fixed
- **Opening Friends ended your call.** Browsing anywhere in Meadhall now keeps the call going, like Discord.
- **Android's Back button did nothing.** It now closes what's open, then goes back from a chat to the list and from a
  space to Home, and finally puts Meadhall in the background.

## v0.5.2 (2026-11-03)

### New
- **↑ edits your last message:** in an empty message box, the up arrow opens your most recent message for editing
  (Enter saves, Escape cancels), like Discord.
- **Voice channels you're not in** show who's in voice and a **Join Voice** button (after leaving a call too), instead of
  an empty page, with the speaker icon instead of # in the header.
- **Add channels like Discord:** a + on Channels and on each category creates a channel right there (a category of voice
  channels starts with Voice picked), and hovering a channel shows Create Invite next to its settings.
- **Ringing like Discord:** calling in a DM or group chat shows the others as "Ringing…" (then Declined or No answer)
  and plays the ring for you until someone picks up. Group chats now ring too; space channels never ring anyone.
  Declining a call tells the caller.
- **Watch Stream:** hover anyone's LIVE badge (also when you're not in the call) and click the preview to join and see
  their stream full size. Your own badge says "You're Streaming!".
- **Device menus:** the small arrows next to the mic and headphones under your name pick the microphone or speaker,
  or open Voice Settings, like Discord.
- **Game overlay, much fuller:** movable widgets for Voice (who's talking, and each person's volume), Text chat (read
  and send to the call's chat, DMs and channels), Notifications (mentions and DMs) and Soundboard. Pin a widget to keep
  it on screen while you play (clicks go through to the game). Overlay settings choose widgets and opacity. If another
  app already uses Shift+`, Meadhall uses Ctrl+Shift+` (or Shift+F10), and the voice panel has a Game overlay button.
- **QR sign-in can bring your encryption keys:** tick "Also bring my encryption keys" and the new device is verified
  and can read your old messages without the recovery key.
- **Pin messages:** Pin message in a message's menu; the pin panel lists every pin (also older ones), with Jump and
  Unpin.
- **Take a photo on phones:** the + next to the message box has Take a photo, which opens the camera instead of the
  gallery. The picture waits in the message box until you send it.

### Changed
- **Warnings reach the member:** warning, muting, banning or kicking someone sends them a message saying so, with the
  reason. Warn no longer sits next to a time setting: muting and banning for a set time have their own group.
- **Auto-mod without a bot is now opt-in:** Space Settings → Auto-mod → "Let moderators' Meadhall enforce auto-mod and
  give onboarding roles" (off unless you turn it on).

### Fixed
- **New channels didn't show up** in the channel list until Meadhall was reopened.
- **Bots couldn't moderate or give roles:** adding a bot with a role saved the role but not its permission level, so the
  bot answered "I can only do that to people ranked below me". "Give the role to everyone already here" had the same
  problem.
- **Member records stayed empty:** the bot's /warn, /timeout, /kick and /ban now go into the moderation log too, and
  logs on homeservers that encrypt every room are read correctly.
- The bot could keep an old copy of permission levels (same fix as below), which could keep timeouts from ending.
- **Room changes that never arrived:** when two changes to a room landed close together (two people leaving a call),
  one could be lost, so people showed as still in a call they had left ("2 connected" in an empty channel). The same
  could keep roles, warnings and onboarding from updating. Meadhall now applies such changes when they arrive.
- Settings could keep saying "Verified: No" after verifying this session from another app.
- Menus like the category menu were see-through.
- Roles on profile cards touched the edge of their box.
- Long names on profile cards were cut off after a few letters: they now wrap and shrink to fit.
- After sending a picture, the chat stopped short of the bottom once the picture loaded; it now stays at the bottom.
- Android: the background connection could stop itself just as Meadhall asked it to start again, which Android treats
  as a crash and closes the app.

## v0.5.1 (2026-11-02)

### New
- **Friends**, like Discord's: Home → Friends shows Online, All, Pending and Blocked, and **Add Friend** sends a
  request by Matrix ID. Requests arrive as a count on Friends. Profile cards have **Add friend** and a
  **"Message @name"** box that sends a direct message without leaving the card.
- **Notification sounds:** pick from 10 built-in sounds (8-bit or smooth) or your own file, with separate
  sounds for mentions and direct messages if you like (Settings → Notifications → Notification sounds).
- **Call controls under "Voice Connected"**, like Discord: camera, screen share, soundboard and call settings right
  below the channel list.
- **Streaming Now previews:** hover someone's LIVE badge in the channel list to see a snapshot of their screen, with
  Watch Stream. Snapshots are only shared in unencrypted channels, and only while someone is sharing.
- **Game overlay (desktop):** press **Shift + `** in any game to show the call controls (mute, deafen, camera,
  screen share, soundboard, leave), who's talking and recent messages over the game. Works in windowed and borderless
  games; exclusive-fullscreen games would need hooking into the game, which anti-cheat can ban for, so Meadhall doesn't.
- **Help:** the **?** at the top of the chat opens Meadhall's help, by category and searchable.
- **Auto-mod and onboarding roles without a bot:** in spaces without a bot, an online moderator's Meadhall removes
  rule-breaking messages (and warns or times out) and gives the roles onboarding answers earn.
- **Homeserver admin panel** with everything Synapse-Admin does: Overview, Users (filters, export, CSV import, and a
  page per user with devices, connections, media, rooms and pushers; lock, reactivate, shadow-ban, rate limits,
  erase), Rooms (make yourself admin, block, purge history, delete), Users' media, Reported events, Room directory,
  Federation (failing servers in red, reconnect), Registration tokens and Server notices.
- **Preview as a newcomer** in Space Settings → Onboarding (admins skip onboarding, so they couldn't see it before).
- **Colored controls** (Settings → Appearance): scrollbars in your theme color or neutral grey, whatever the shapes.
- Guides: [setting up the Meadhall bot](docs/bots.md) and [installing on your iPhone for free](docs/ios-free-install.md).

### Fixed
- **Calls with people on other homeservers:** Meadhall now joins the call on the call server it is already running on
  (whoever has been in it longest), like Element Call, instead of always using your own homeserver's. People from
  different homeservers end up in the same call and hear each other.
- **People invited to a space skipped its onboarding.** An invited space now asks you to Accept or Decline, its
  channels are joined only after that, and onboarding opens as soon as you enter.
- Channels created after a bot was added now invite the bot and follow the space's roles.
- The profile card's "..." menu was cut off at the panel's edge.
- Scrollbars lost their color with Rounded shapes.
- The settings section above Sign out is called "Session" instead of "Danger".
- The QR sign-in card shows the exact Synapse setting to copy when the homeserver doesn't allow it.

## v0.5.0 (2026-11-01)

### New
- **Space bots**, like Discord's apps (Space Settings → Community):
  - **Bots:** add any Matrix account as one of the space's bots, give it roles, and remove it. Bots get a **BOT**
    tag, and their **slash commands** appear when you type `/` in the message box, with how to use each one.
  - **Onboarding:** new members read the space's rules and answer a few questions before they can talk. Answers can
    give roles. Choose "Ask first", or "Require it" to have the homeserver enforce it (only members who finished can
    talk). A **welcome message** can greet them in a channel.
  - **Auto-mod:** blocked words and phrases, links, and too many mentions. The bot removes the message and can warn the
    person or time them out.
  - **The Meadhall bot** (`apps/bot`, runs with Node or Docker): does onboarding, welcomes, auto-mod and moderation
    commands (`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/rules`, `/help`), always checking that the person
    asking is allowed to.
- **Camera preview:** turning your camera on in a call first shows you how you look (only to you), with the camera
  picker. Settings → Audio has a Camera section with a Test camera button.
- **Reports and moderation in spaces:** report someone, or one of their messages (hold or right-click it), with
  the reasons the space's owner chose (curse words, unauthorized self-promotion and so on). Only the space's
  moderators see reports, in **Space Settings → Reports**, with quick actions: warn, kick, ban, **ban for a time**,
  **mute for a time** and **shadow mute** (their messages are hidden from everyone else; they aren't told). **Member
  records** show everything moderators did to someone in that space and what's in force now. Timed bans and mutes
  end on their own.
- **Message links open in Meadhall:** "Copy link" makes a `meadhall://` link that opens the app right at that
  message (desktop and Android), and room links from matrix.to clicked inside Meadhall open there too. Links in
  messages show a **preview**: the conversation, and for a message who wrote it and how it starts.
- **Phones, redesigned:** a centered bottom tab bar (Home, Inbox, You; settings are under You, and homeserver admins get an
  **Admin** tab for the admin panel), a cleaner top bar in chats (the name, a small lock, call and a "…" menu), settings as a list you
  tap into, hold a message for its menu, dialogs as sheets from the bottom, every button big enough to tap (48 px),
  16 px text in fields (no more zooming in on iPhone), and room for the notch and home indicator. In calls, the
  buttons are Mute, Camera, More (sounds, deafen, voice settings) and Leave; tap "Voice Connected" to get back to the
  call.
- **Shapes** (Settings → Appearance): **rounded corners are the new default**, the same across the app; choose
  **Square** for the blocky pixel frames and bevelled buttons of earlier versions. Mix it with the font (Pixel, Pixel
  headings, System or any installed font) and icon choices; style profiles keep it too.
- **Pick your look when you sign in:** pixel or smooth for everything, or part by part (font, icons, shapes, emoji and
  your speaking campfire), with a live preview. Your look now **follows your account**, so your PC and phone match.
- **New message button** next to "Find a conversation".
- **Sign in another device** from the You menu: shows a QR code that works for 3 minutes.
- **Status and game together:** someone with a status who is also playing shows both.

### Changed
- **Spaces are called spaces:** "server" now only means a Matrix homeserver. Space Settings, "Leave space", "Mute
  space", per-space profiles and so on.
- Game detection updates within seconds, so quitting or switching games shows quickly.
- Turn people up to **130%** in calls (was 120%), and keep up to **100 sounds** on your soundboard (was 24).
- "Set up secure backup" no longer comes back every time you start Meadhall after you choose "Skip for now" (it asks
  again after a week; Settings → Security sets it up any time).
- On phones, polls and stickers moved into the "+" menu next to the message box; "+" now matches the message box.
- The Home tab on phones is a house icon (pixel or smooth, with your icon style).
- Report is only offered in spaces for now (it goes to the space's moderators). Screen sharing isn't offered on
  phones, where it can't work.
- Pictures and read receipts stay inside a message's highlight; rounded conversation rows and search with smooth
  shapes; no empty strip above a chat's title on Windows.
- **Sharper logo:** the icon is rebuilt as clean pixel art, without the gray fringe around its edges, at every size.
- **A real phone app icon:** on Android and iOS the icon is the hall scene filling the icon shape (no more badge with
  its corners cut off by the round mask).
- Clearer, calmer desktop layout: one set of text sizes (titles, names and messages, secondary text, labels), spacing
  on an 8 px grid, and one main button per screen (the others are outlined).
- Easier to read: no important text smaller than 12 px, larger names and list rows, settings pages at a readable
  width, a visible focus ring on every control for keyboard users, and no gray flash where you tap.

### Fixed
- **"Playing …" stuck on the old game:** quitting one game and starting another now shows the new one.
- Everyone (you too) no longer blinks offline for a moment when Meadhall reconnects.
- The "+" buttons (attach, create a space, add a sound) and the close buttons of the image viewer and Settings are
  centered exactly (drawn icons instead of typed characters), and Settings has no empty band above its title on
  Windows.

## v0.4.2 (2026-10-27)

### Fixed
- **Shared sounds and style profiles kept saying "Adopt"** after you adopted them: pressing Play, reopening the chat
  or restarting turned the button back. Meadhall now remembers which share each one came from, so the card stays
  "Added to your soundboard" (also for sounds you adopted before this update with the same name).
- **Long sound names** no longer run under the Play button on share cards or push the soundboard's buttons over each
  other and out of the panel; they wrap to two lines (full name on hover).

## v0.4.1 (2026-10-27)

### New
- **Threads:** replies sent "in a thread" (by Element, FluffyChat, or bots like baibot) used to ping you without
  showing up anywhere. Now a message with replies shows **"N replies"** under it, and clicking it opens the thread
  beside the chat (over it on phones), where you can read and answer. Hover any message and choose **Reply in
  thread** (🧵) to start one.
- **Verify with your recovery key** in Settings → Encryption & Recovery, for a session that skipped it at sign-in.

### Fixed
- **Verification between Meadhall and other apps:** Meadhall called itself verified while FluffyChat and Element
  didn't agree, and they called themselves verified while Meadhall didn't. Entering your recovery key now also
  fetches your account's signing keys and signs this session, so every app agrees it's verified and Meadhall
  trusts your other sessions in turn. "This device verified" now shows what your other apps see.
- **"Verify this device"** in settings got cancelled as soon as your other device answered, and after a
  verification Meadhall could send you back to the recovery key screen. Emoji verification now works, and the keys
  your other session shares afterwards are picked up on their own.
- **Recovery key safety:** Meadhall no longer offers to set up a new recovery key when your account already has one
  from another app (that would have locked away the keys your other apps use). It asks for the existing key instead,
  and only lets you change it from a verified session. Setting up a recovery key on an account that never had
  encryption set up now also creates its signing keys, so your Meadhall sessions can verify each other.
- **Inbox:** "✓" and "Mark all read" now clear conversations whose unread messages are thread replies, the inbox
  lists those replies ("in a thread") and opens the thread when you click one, and it updates as soon as you mark
  something read.

## v0.4.0 (2026-10-26)

### New
- **Webcam:** turn your camera on in any call; everyone sees it next to the people in the call. Pick the camera in
  the call settings.
- **Push to talk:** in the call settings, with a key of your choice. If you talk without holding it, a small
  reminder says push to talk is on.
- **Polls:** the poll button in the message box. Several answers or one, anonymous (Meadhall shows only totals),
  results live or only at the end, and a time limit: when it's up, the results are posted in the chat. Change your
  vote any time before it closes. Works with Element's polls.
- **Code blocks** with syntax highlighting: write ` ```ts ` (or python, rust, json...) and the code is colored, with
  a Copy button. Inline `code` too. Formatting from other apps (bold, italic, lists, quotes, code) now shows.
- **Activity, your way** (desktop, Settings → Privacy → Activity): besides Steam, Meadhall can show what apps with
  **Discord Rich Presence** report (games, music players, editors) and games it recognises on your PC, and on Linux
  **"Listening to ..."** from your media player. These are off until you turn them on. Choose whether details show,
  keep a **never share** list, and choose **who sees it**: people you share a chat or server with (new default),
  only people you have DMs with (sent end-to-end encrypted), everyone, or nobody.
- **Other people's soundboards:** turn everyone's sounds down in Settings → Audio or the call settings, or one
  person's with the new **Sounds** slider under their name, without turning their voice down. Your sounds now play
  even while you're muted.
- **Share sounds from a call:** the soundboard in a call has the share button too.
- **Sound style:** Settings → Notifications → 8-bit or **smooth** versions of the message and call tunes.
- **10 more voice effects** (29 in all): Elf, Orc, Witch, Demon, Spirit, Knight, Arcade, Stadium, Announcer and
  Whisper.
- **Sign in with a QR code:** Settings → Devices → Sign in another device shows a one-time code; on the new device
  choose **Sign in with QR code** and scan it (or paste it). Your homeserver has to allow it.
- **Languages:** Español, Deutsch, Français and Português (Brasil) for sign-in, settings, the message box and call
  controls (more to come). Pick one on the sign-in screen or in Settings → Appearance.
- **Reduce motion** (Settings → Appearance, or your system setting): stops the campfire, animations and GIF banners.
- **Voice channel chat** now sits under the call, like a DM, instead of in a narrow column.

### Changed
- **Link previews** are off in encrypted chats by default, because your server has to fetch the page to make one
  (Settings → Privacy → Link previews).
- **What you're playing** is no longer saved in your public profile unless you choose **Everyone**.
- The channel type option only appears for server channels.
- **Switching accounts during a call** now asks first, since switching restarts Meadhall and ends the call. Keeping
  the call going while you switch is planned.

### Fixed
- **Too many notifications during calls:** joining, leaving and call signals no longer pop up or play sounds.
- **Notifications didn't clear:** opening a conversation now clears its notifications on desktop, and marks it read
  reliably.
- **Deleted messages vanished without a trace:** they now say "Message deleted by ...". Messages this device can't
  decrypt say so instead of showing nothing.
- **Badges** now show on profile cards even with long names, and the window buttons take the color of a profile
  card's gradient under them.
- Opening someone's profile shows their current card style (it could be up to 10 minutes old).
- Screen readers: channel lists are announced as lists, and sign-in / register as tabs.

### Security and releases
- Every release file now has **signed build provenance**: `gh attestation verify <file> --repo PeytonG/Meadhall`.
- The Android app no longer includes Google's services plugin. Meadhall is getting ready for **Flathub** and
  **F-Droid**; Android users can already use **Obtainium**.
- Windows code signing (through the SignPath Foundation) is planned for **v1.0.0**, the first non-beta release.

## v0.3.5 (2026-10-24)

### New
- **Ringtone settings:** Settings → Notifications → Ringtone turns ringing off (the call card still shows) or rings with
  your own sound instead of Meadhall's jingle, with a test button, like the message sound.

### Fixed
- **Sending GIFs, pictures and files failed with "Access token has expired"** after a few quiet minutes. Uploads now
  renew the sign-in and try again.
- **"Open in the background when you sign in to your computer"** unticked itself on Windows right after being turned
  on. It stays on now.
- The desktop app identified itself as "@heorot/desktop" (seen in bug reports); it says Meadhall now, and bug reports
  get a readable version line.

## v0.3.4 (2026-10-24)

### New
- **Right-click a server** for a menu like Discord's: Mark as read, Invite, Mute, Notification settings, Hide muted
  channels, Show all channels, Privacy settings, Edit per-server profile (a nickname and picture just for that
  server), Server settings, Move to... and Leave. **Right-click a channel** to mark it read, mute it, change its
  notifications, copy its link or edit it.
- **Mute** servers and channels: no notifications, and they don't count as unread. It works on every device, and in
  Element too.
- **Channel types:** text (#), voice, rules, FAQ, news and events, each with its own pixel icon (smooth with the
  Smooth icon style). Rules and news channels start with only moderators posting; everyone can still react.
- **Unread counts** on each channel and on server icons in the rail.
- **Server banners:** a picture or GIF under the server's name, set in Server settings → Overview.
- **Inbox:** a button in the top bar listing everything you haven't read (or only your mentions), grouped by
  conversation. Jump there, or mark things read.
- **Update arrow:** a green download arrow in the top bar when an update is out.
- **Members by role:** the member list groups people under their highest role, highest rank first, then Online and
  Offline. People who can manage roles can right-click someone (or use ...) to give or take roles.
- **Text chat in voice channels:** turn it on in a voice channel's settings and the chat shows beside the call.
- **Badges:** founding members of Meadhall wear a gold coin after their name. Only Meadhall's own signed list makes
  official badges; anything else shows as "unofficial" behind a "...".
- **Profile style:** a gradient for your profile card and a nameplate behind your name in member lists (Settings →
  Profile), drawn in pixel bands.
- **Style profiles:** save your look (theme, colors, fonts, icons, card and nameplate) and switch between looks
  (Settings → Appearance).
- **Sharing** (turn it on in Settings → Privacy & Safety): send friends your soundboard sounds and style profiles.
  They see a card showing what it adds, and Adopt adds it. You can also save and import them as `.meadhall` files.
- **Bug reports reach the developer** inside Meadhall, under Home → Bug reports.

### Changed
- Channels list their type with an icon instead of "#" text.
- The screen share picker opens straight away and fills in previews as they're captured.
- The call's history in the call settings shows only the current call; earlier calls are in Settings → Logs.

### Fixed
- **Screen share previews** were always "No preview", and the picker took seconds to open. **Stream this** is
  always in view now (in every dialog, the buttons stay put while the list scrolls).
- **A call started in a server's text channel** notified everyone in it. Only DMs and group chats ring or notify.
- **GIFs** copied from a web page or Discord and pasted were still pictures. They loop now.
- **Server pictures** that couldn't be loaded showed a broken image; now the server's initial shows instead.
- Invites to group chats and DM invites no longer flicker between lists.

## v0.3.3 (2026-10-23)

### New
- **Report a bug:** Settings → Report a bug sends what went wrong (pick a category, describe it, add a screenshot if
  you like, and optionally the app version and recent logs) to the Meadhall developer, as a message from your
  account. It doesn't appear in your chats.
- **Logs:** Settings → Logs shows your call history (when calls started, dropped, rejoined and why they ended) and the
  errors the app ran into, each with a hint about what it usually means. Copy either into a bug report. Logs stay on
  your device, and anything that looks like a password or access token is left out.
- **"Call ended" notice:** if a call ends without you choosing to (nobody else there for 5 minutes, or the connection
  dropped and couldn't come back), a notice says why wherever you are in the app, with **View details** opening
  Logs.
- **Icon style:** Settings → Appearance → Icons switches the buttons between pixel art (the default) and smooth lines.
- **Unencrypted chip:** rooms without end-to-end encryption show a red **Unencrypted** chip with an open lock in the
  header.
- **Server notices (server admins):** Settings → Server admin can send a message from the server to everyone or to
  chosen people, like the Synapse admin page.
- **Share my status:** Settings → Privacy & Safety lets you stop sharing your status: you appear offline to everyone,
  with no status text, Do Not Disturb or game shown.
- **Debian, Ubuntu and Mint package:** a `.deb` download alongside the Fedora `.rpm` and the AppImage.

### Changed
- **Status on other servers:** people whose server doesn't share online status (matrix.org, for one) show a **?**
  instead of looking permanently offline.
- **Invites to group chats** (and server notices) show under Home → Group Chats with Accept and Decline. They didn't
  appear anywhere before.
- **Linux install steps in the README work** on Fedora, Debian/Ubuntu/Mint and other distributions, including what to
  install for the AppImage.

### Fixed
- **Updating or going back to another version on Fedora** failed with "Command pkexec exited with code 127". The
  `.rpm` and `.deb` now install through your package manager, after asking for your password.
- **Device verification** no longer fails with "startVerification(): other device is unknown": emoji comparison
  waits until your other device has accepted.
- **Meadhall's icon on the Fedora (GNOME) taskbar** instead of a generic one.
- **Meadhall's icon on the Windows taskbar** instead of Electron's. If you still see Electron's icon, delete
  `Electron.lnk` from `%APPDATA%\Microsoft\Windows\Start Menu\Programs` and restart Meadhall.
- The `.rpm` and `.deb` now pull in the sound and graphics libraries Meadhall needs, so it starts on a minimal
  install.

## v0.3.2 (2026-10-23)

### New
- **Taskbar unread bubble (desktop):** a red bubble on Meadhall's taskbar icon shows how many notifications are
  waiting (1-9, then 9+), like Discord.
- **Screen share previews:** the "Choose stream source" window shows a preview of every screen and window (grouped
  into Screens and Windows) before you stream.
- **Trim sounds before adding them:** pick the part of a sound to keep (up to 8 seconds) on its waveform, with a
  preview; long files no longer get refused.
- **Soundboard volume:** in the call settings, the Sounds panel and Settings → Audio.
- **Crop your profile banner:** the preview now matches the profile card exactly; drag to choose what shows and zoom
  if the picture doesn't fill the space.
- **Block / Ignore works:** blocking someone (from their profile) hides their messages and invites on all your
  devices; unblock in Settings → Privacy.
- **Install an earlier version (desktop):** Settings → Updates lets you go back to an earlier release if an update
  causes trouble. Versions before 0.3.2 can't do this themselves, so going back to one means updating to the newest
  version before you can choose another; Meadhall warns you first.
- **Call history:** a call's settings show why calls ended (copyable for bug reports).

### Changed
- **Soundboard sounds play over your microphone**, so they light up your speaking indicator, and they need your mic
  unmuted. This also removes the false "Local microphone is publishing silence" warning.
- **Calls rejoin by themselves** after the network or call server drops them, and say why.
- **"Playing ..." shows under your name** in the user panel, under names in the member list and on profiles, not just
  in Direct Messages. With no custom status it's also your status text, so it reaches others right away.
- **Statuses update faster** for others. (Matrix servers also limit how often a status can change; see the
  self-hosting guide to loosen that on your server.)
- **Screen sharing fits the window:** the shared screen no longer runs off the bottom, and several streams each keep
  their shape side by side.
- The soundboard in calls fits the call view and scrolls when it's full, keeping its title and volume in sight.

### Fixed
- **The incoming call box can be clicked in the desktop app** when you're in another chat (Join and Dismiss were
  dragging the window instead).
- **Calls with people on other servers** no longer end after 5 minutes as if you were alone.
- **Meadhall's icon is back on the taskbar** (the window now sets it itself).
- The newest message is marked read even if it arrives while an earlier one is being marked (the unread count could
  stick until you scrolled).

### Security
- Fixed the open code-scanning alerts (a service-worker message check and a build-script race).
- The desktop app only answers its own page: other pages can't use its desktop functions.

## v0.3.1 (2026-10-23)

### New
- **What's new:** after the desktop or phone app updates, a one-time window shows what changed in the new version.
- **Multiple accounts:** sign in to more than one account (say one on matrix.org and one on your own server) from
  the user panel → **Add an account**, switch between them there, and keep getting notifications for all of them:
  clicking one switches to that account and opens the conversation. Signing out of one carries on as the other.
- **High contrast theme** (Settings → Appearance) for people who find the other themes hard to see: black
  background, white text, bold outlines, a yellow focus ring, and your accent color brightened to stay readable.
- **Phones: a send button** next to the emoji button, and **swipe** right to go back to your conversations (left to
  return to the chat).
- **Set your status** from the user panel, like Discord: Online, Idle, Do Not Disturb, Invisible, and a custom status
  message. Do Not Disturb silences notifications and call ringing. Online status now works in the web and Android
  apps too, not only on desktop.
- **"Playing ..." from Steam (desktop app):** the game Steam is running shows under your name, like Discord. It is
  read from Steam's own files on your computer (no Steam login or API key); turn it off in Settings → Privacy.
- **Tray menu (Windows and Linux):** Mute, Deafen and your status (Automatic, Online, Away, Do Not Disturb,
  Invisible) right from the tray icon; it stays in step with the app.
- **Automatic Away:** with the Automatic status you show as Away after 10 minutes without input (anywhere on the
  computer, in the desktop app) and go back to Online as soon as you return. "Idle" is now called "Away".
- **Update notice on Android (and iOS (Beta)):** like the desktop app, phones tell you when a new version is out,
  with a link to download it (TestFlight on iPhone) and step-by-step install directions (Settings → Updates, where
  the notice can be turned off).
- **iOS app (Beta):** an iPhone version, installed through TestFlight by invitation while it's tested.
- **Soundboard:** in a call, open **Sounds** to play a sound for everyone: 12 built-in 8-bit sounds (duck, fart,
  sword, air horn, ba dum tss, coin, bell, war horn, sad trombone, applause, crickets, level up) and up to 24 of your
  own (8 seconds, 1 MB each), managed and previewed in Settings → Audio. Your sounds follow your account.
- **12 new voice changer effects:** Chipmunk, Dragon, Dwarf, Ghost, Cave, Underwater, Alien, Telephone, Megaphone,
  Choir, Wobble and Bard.
- **Profile banner, About me, email and links:** upload an image or GIF banner and add a bio, a public email and up to
  five links in Settings → Profile; they show on your profile card.
- **Roles decide who can talk:** in Server Settings → Members, each channel now has **Can talk** (everyone, or a role
  and every role above it) next to **Can see**. In voice channels it also decides who can join the call. The server
  enforces it, so it holds in Element too.
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
- **Resetting a password in the server admin panel works in the desktop app.** It asked for the new password in a
  browser pop-up the desktop app doesn't have, so nothing happened; it's now a small form under the person.
- Quick status changes (or a game starting right after one) no longer leave an older status showing to others.
- The speaking ring around a picture in calls is round again (it had turned square), and the soundboard in
  Settings no longer shows its title twice.
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
