# Meadhall help

This file is the help for Meadhall. The Help button (the ? at the top of the chat) shows it, and it is written so that
a small AI model can also read it and answer questions. Each "###" section answers one question. Paths use "→" between
steps. "Settings" always means your own settings: the gear next to your name at the bottom left (on phones: the You tab).
"Space Settings" means the settings of one space: open the space, then click its name at the top of the channel list
and choose Space settings (or the Settings button next to the name).

Words used in this help:
- A **space** is a community, like a Discord server. It has channels.
- A **channel** is a text or voice room inside a space.
- A **homeserver** (or "server") is the Matrix server your account lives on, for example matrix.org.
- A **DM** is a direct message: a private chat with one person.

## Getting started

### What is Meadhall?
Meadhall is a chat app for Matrix. It works like Discord: spaces with text and voice channels, direct messages, calls,
screen sharing and friends. Your account lives on a Matrix homeserver, and you can talk to people who use other Matrix
apps (Element, FluffyChat and others).

### How do I create an account?
On the sign-in screen, press Register. Pick a homeserver (the default is filled in), a username and a password. Some
homeservers need a registration token (an invite code) from whoever runs them: type it in the Registration token box.

### How do I sign in on another device with a QR code?
On a device where you are already signed in: Settings → Devices → Sign in another device → Show QR code (you type your
password first). On the new device, choose Sign in with QR code and scan it. The code lasts 3 minutes and only works
once. If the card says your homeserver doesn't allow it, the homeserver's admin must turn on
login_via_existing_session in Synapse (the card shows the exact setting to copy).

### How do I change how Meadhall looks the first time?
When you first sign in, the look picker asks: pixel or smooth font, icons and shapes. You can change any of it later in
Settings → Appearance.

### Where do I get the apps?
Windows, Linux and Android downloads are on the Meadhall releases page on GitHub. iPhone: through a TestFlight invite,
or install it yourself for free with a Mac and Xcode (docs/ios-free-install.md). Meadhall also runs in a web browser.

## Spaces and channels

### How do I create a space?
Click the + at the bottom of the space list on the left (Create Space). Give it a name. You can add an icon and a banner
later in Space Settings → Overview.

### How do I join a space I was invited to?
Invited spaces appear in the space list on the left. Click it, then press Accept on the invitation card (or Decline).
If the space has onboarding, its rules and questions open right away.

### How do I invite people to a space?
Right-click the space in the space list → Invite to space. Type their Matrix ID (like
@name:example.org). They see the invite in their space list.

### How do I create a channel?
Right-click the space in the space list → Create channel, or use the + next to the channel list. Choose text or voice. Only people who may
manage channels can do this.

### How do I make a channel private, or limit who can talk?
Space Settings → Members → Channel access. Pick who can see the channel and who can talk in it, by role.

### How do I mute a space or a channel?
Right-click the space in the space list (or a channel) → Mute, or Notification settings. You can also hide muted
channels from the right-click menu.

### How do I leave a space?
Right-click the space in the space list → Leave space. Or Space Settings → Danger zone → Leave space.

### What is the inbox?
The tray icon at the top right of a channel (Inbox) lists every unread message, or only mentions, grouped by
conversation. Mark them read from there.

## Messages

### How do I reply, edit or delete a message?
Hover over a message (long-press on phones) to see its actions: reply, react, edit (your own), delete (your own, or
anyone's if you can manage messages), pin, reply in thread, copy link, report.

### How do I send pictures, files, polls or stickers?
Use the + to the left of the message box for files and pictures. The poll button and the sticker button are on the right
of the message box. Paste a picture or GIF straight into the box to send it.

### How do I start a thread?
Hover over a message → Reply in thread. Thread replies show as "N replies" under the message.

### How do I link to a message?
Hover over the message → Copy link. Meadhall links (meadhall://) open the app at that message and show a preview card.

### What does the red "Unencrypted" chip mean?
The channel is not end-to-end encrypted: the homeserver can read its messages. DMs are encrypted.

### Why does a message say it couldn't be decrypted?
This device doesn't have the keys for it. Restore them in Settings → Encryption & Recovery with your recovery key, or
verify this device from another signed-in device (Settings → Devices → Verify this device).

## Friends and direct messages

### How do I add a friend?
Home (the Meadhall logo at the top of the space list) → Friends → Add Friend. Type their Matrix ID and press Send
Friend Request. Or open their profile card and press Add friend.

### How do I accept a friend request?
Home → Friends → Pending → Accept. A red number on Friends shows how many requests are waiting.

### How do I remove a friend?
Home → Friends → All → Remove next to their name.

### How do I message someone?
Home → the + at the top (New message), or open their profile card and type in the "Message @name" box at the bottom of
the card, or press Message. From the Friends list, press Message.

### How do I block someone?
Open their profile card → Block / Ignore. You stop seeing their messages and invites. Unblock in Settings → Privacy &
Safety → Blocked people, or Home → Friends → Blocked.

### What are group chats?
DMs with more than one other person. Start one from Home → Group Chats → +.

## Calls, voice and screen sharing

### How do I join a voice channel?
Click a voice channel in a space. You join the call right away. Leave with the red phone button (Leave voice channel).

### How do I call someone directly?
Open their profile card → Call, or open your DM with them and press the phone button at the top.

### What are the buttons under "Voice Connected"?
While you are in a call, the box under the channel list shows the call (click it to go back to the call), a red
phone to leave, and four buttons: camera, share screen, soundboard and call settings.

### How do I mute or deafen?
In a call, use the microphone button (Mute microphone) and the headphones button (Deafen). The same buttons are next to
your name at the bottom left and work any time.

### How do I share my screen?
In a call, press Share screen, then pick a screen or window from the previews. Several people can share at once.
Phones can't share their screen.

### How do I see what someone is streaming before joining?
In the channel list, hover over the person with the red LIVE badge under the voice channel. A card shows a recent
snapshot of their screen and a Watch Stream button. Snapshots are only shared in unencrypted channels.

### How do I turn on my camera?
In a call, press Turn camera on. You see a preview of yourself first. Pick the camera in Settings → Audio → Camera.

### How do I use the soundboard?
In a call, press Soundboard. Play the built-in sounds or add up to 100 of your own (Settings → Audio → Soundboard),
trimmed to 8 seconds. Turn other people's soundboards down in Settings → Audio → Other people's soundboards.

### How do I use push to talk?
In a call, open Voice settings (the gear in the call) and turn on push to talk, then choose the key. It only works while
Meadhall is the focused window.

### How do I change my voice?
Settings → Audio → Voice changer. Pick an effect; it applies in calls.

### My microphone doesn't work.
Settings → Audio → Microphone test shows the level. Check the right microphone is chosen in Voice settings during a
call, and that your system allows Meadhall to use the microphone.

### What is the campfire?
The flames around someone's picture while they talk. Turn it into a simple ring in Settings → Audio → Speaking campfire.

## Profile and status

### How do I change my name or picture?
Settings → Profile. Change your display name, avatar, banner, About me and links.

### How do I set a status?
Click your name at the bottom left. Choose Online, Away, Do Not Disturb or Invisible, or set a custom status.

### How do I show what game I'm playing?
Settings → Privacy & Safety → Activity. Meadhall can show the game you're playing (Steam and detected games) and who may
see it.

### How do I change my profile card colors?
Settings → Profile → Profile style. Choose a gradient or your own colors.

## Notifications and sounds

### How do I turn notifications on or off?
Settings → Notifications. Per space or channel: right-click it → Notification settings or Mute.

### How do I change the notification sound?
Settings → Notifications → Notification sounds. Pick a sound for Messages, for Mentions and replies to you, and for
Direct messages: one of the built-in sounds or your own file (Use a file, up to 1 MB). Preview plays it. Mentions and
DMs can be "Same as messages". Sound style switches the built-in sounds between 8-bit and smooth. The ringtone for
calls is in Settings → Notifications → Ringtone.

## Settings and looks

### How do I switch between the pixel look and the smooth look?
Settings → Appearance. Font: pixel or system (or any installed font). Icons: pixel or smooth. Shapes: Rounded or
Square. Emoji: pixel emoji on or off. Every part can be changed on its own.

### How do I change the theme color?
Settings → Appearance → Theme color. Pick any color; it is adjusted to stay readable.

### How do I turn off colored scrollbars?
Settings → Appearance → Colored controls.

### How do I use light mode or high contrast?
Settings → Appearance → Theme.

### How do I change the language?
Settings → Appearance → Language.

### How do I reduce animations?
Settings → Appearance → Motion → Reduce motion.

### How do I update Meadhall?
Desktop: Settings → Updates (or the update banner that appears when a new version is out). Android: the update notice
in the app opens the download.

## Moderation, roles and bots

### How do I give people roles?
Space Settings → Members → Roles. Create roles with colors, ranks and permissions, then give them to members in
Space Settings → Members.

### How do I report a message or a person?
Hover over the message (long-press on phones) → Report, or open their profile card → Report. Reports go to the space's
moderators.

### How do moderators handle reports?
Space Settings → Reports. Open a report and warn, mute (also for a set time), shadow mute, kick or ban. Member records
show everything done to someone.

### How do I set up onboarding (rules and questions for newcomers)?
Space Settings → Onboarding. Turn it on, write rules and questions; answers can give roles. Use Preview as a newcomer to
see it, since admins and moderators skip it. "Require it" means only people with the member role can talk.

### How do I set up auto-mod?
Space Settings → Auto-mod. Block words, links and mention spam, and choose delete, warn or time out. Without a bot, an
online moderator's Meadhall enforces it; with a bot it works around the clock.

### How do I add a bot?
Make an account for the bot and run the Meadhall bot (see docs/bots.md). Then Space Settings → Bots → Add a bot, type
its Matrix ID and give it a role. Its commands appear when you type / in the message box.

### What slash commands are there?
Type / in the message box to see them. With the Meadhall bot: /help, /rules, /warn, /timeout, /untimeout, /kick, /ban.

## Privacy and security

### How do I set up a recovery key?
Settings → Encryption & Recovery → Secure Backup. Save the recovery key somewhere safe: it unlocks your encrypted
messages on new devices.

### How do I verify a device?
Settings → Devices → Verify (next to the device), or Verify this device. Compare the emoji on both devices.

### How do I sign out other devices?
Settings → Devices → Sign out next to the device.

### How do I sign out?
Settings → Session → Sign out. On desktop, Quit app closes Meadhall completely.

### Who can see my answers to onboarding questions?
Members of that space. They are stored in the space.

## Homeserver admins

### Where is the admin panel?
Settings → Server admin. It only appears for homeserver admins. Sections: Overview, Users, Rooms, Users' media,
Reported events, Room directory, Federation, Registration tokens and Server notices.

### How do I create accounts or invite codes?
Settings → Server admin → Users → Create account, or Registration tokens → Create token (people type the token when
they register).

### How do I lock, deactivate or erase an account?
Settings → Server admin → Users → Details next to the person → User tab. Locked stops them using the account without
deleting anything. Deactivated signs them out for good (reactivating needs a new password). Erase user data also removes
their profile and media.

### Why does another server show in red under Federation?
Your homeserver can't reach it and is waiting longer between tries. Press Reconnect to try again now.

## Troubleshooting

### Meadhall says it can't connect.
Check your internet connection. If only Meadhall fails, your homeserver may be down: try again later or ask its admin.

### Calls connect but I can't hear someone.
They may be muted, or on a homeserver whose call server Meadhall can't reach yet. Ask them to check their microphone in
Settings → Audio → Microphone test.

### Where are the logs for a bug report?
Settings → Logs shows call logs and errors. Settings → Report a bug sends a report with them.

### I see "Couldn't decrypt this message".
See "Why does a message say it couldn't be decrypted?" under Messages.
