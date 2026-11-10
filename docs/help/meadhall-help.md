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
once. Tick "Also bring my encryption keys" to have the new device verified and able to read your old messages without
the recovery key (only do this for your own device: while it shows, the code also unlocks your messages). If the card says your homeserver doesn't allow it, the homeserver's admin must turn on
login_via_existing_session in Synapse (the card shows the exact setting to copy).

### How do I change how Meadhall looks the first time?
When you first sign in, the look picker asks: pixel or smooth font, icons and shapes. You can change any of it later in
Settings → Appearance.

### Where do I get the apps?
Windows, Linux and Android downloads are on the Meadhall releases page on GitHub. iPhone: through a TestFlight invite,
or install it yourself for free with a Mac and Xcode (docs/ios-free-install.md). Meadhall also runs in a web browser.

### How do I go back on a phone?
Use the back arrow at the top left of a chat, or swipe right. On Android the Back button or gesture works too, one
step at a time: it closes an open menu, dialog or picture first, then goes from a chat to the list, then from a space
to Home, and finally puts Meadhall in the background (it keeps running, so calls and notifications continue).

## Spaces and channels

### How do I create a space?
Click the + at the bottom of the space list on the left (Create Space). Give it a name. You can add an icon and a banner
later in Space Settings → Overview.

### How do I join a space I was invited to?
Invited spaces appear in the space list on the left. Click it, then press Accept on the invitation card (or Decline).
If the space has onboarding, its rules and questions open right away.

### How do I invite people to a space?
Right-click the space in the space list → Invite to space, or hover any channel and press the invite icon (Create
Invite) next to its settings. Type their Matrix ID (like
@name:example.org). They see the invite in their space list.

### How do I create a channel?
Use the + next to Channels at the top of the channel list, or the + on a category (the channel goes in that
category), or right-click the space in the space list → Create channel. Pick Text, Voice or another type, then Create. Choose text or voice. Only people who may
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

### How do I pin a message?
Right-click the message (or hover and press ..., or long-press on phones) → Pin message. Pinned messages are in the
pin panel: the pin button at the top of the channel. Jump goes to the message; Unpin removes it. Only people with the
Pin messages permission (Space Settings → Members → Roles) can pin or unpin.

### How do I send pictures, files, polls or stickers?
Use the + to the left of the message box for files and pictures. The poll button and the sticker button are on the right
of the message box. Paste a picture or GIF straight into the box to send it. On phones, the + also has Take a photo
(opens the camera; the picture waits in the message box until you press Send), Upload a file, Create a poll and Send a
sticker.

### How do I open or download a file someone sent?
Every file in the chat has a Download button (the arrow on its right); on Android files go to your Downloads folder.
Click (tap) the file to open it inside Meadhall: PDFs show their pages (zoom with − and +, scroll for more pages), Word
documents (.docx) show their text, and text or code files (.txt, .log, .md, .json, .csv, code) show all their text.
Text files also show their first lines right in the chat; press Expand for more. Other files just download. Videos and
voice clips play in the chat and have a Download button too.

### How do I look at a picture up close?
Click (tap) a picture in the chat to open it. Click where you want to zoom in, or scroll the mouse wheel; on phones
pinch with two fingers. Drag (one finger on phones) to move around a zoomed picture. Click without dragging to zoom
back out. Download (the arrow at the top right) saves the picture; on Android it goes to your Downloads folder. Close
with the X, Escape (Back on Android) or a click next to the picture.

### How do I quickly edit the message I just sent?
With the message box empty, press the up arrow (↑). Your last message opens for editing in the box. Change it and press
Enter to save, or Escape to cancel.

### How do I start a thread?
Hover over a message → Reply in thread. Thread replies show as "N replies" under the message.

### How do I link to a message?
Hover over the message → Copy link. Meadhall links (meadhall://) open the app at that message and show a preview card.

### What does the red "Unencrypted" chip mean?
The channel is not end-to-end encrypted: the homeserver can read its messages. DMs are encrypted.

### Why does a message say it couldn't be decrypted?
This device doesn't have the keys for it. Restore them in Settings → Encryption & Recovery with your recovery key, or
verify this device from another signed-in device (Settings → Devices → Verify this device).

## Shared notes

### How do I make shared notes with someone?
In a DM or group chat: the notes button at the top of the chat (on phones: ... → Shared notes). In a space: Notes,
above the channels. The first time, press Start shared notes (in a space only moderators can start them; after that
everyone in the space can use them). Notes in an encrypted chat are encrypted too.

### How do I add notes and folders?
In the notes, press Note or Folder. New ones go into the folder you picked (folders can hold folders). Name a note
in the box at the top of it. To move something, drag it onto a folder, or use its ... → Move to. ... → Rename or
Delete (deleting a folder deletes everything in it, for everyone).

### Can several people edit a note at the same time?
Yes. Everyone in the chat or space sees changes within a moment, and edits made at the same time are combined. The
bottom of the note says when it's saved and who edited it last.

### How big can a note be?
Up to 300 KB of text (0.3 MB). The bottom of the note shows how much is used. When a note is full, start another one.

### How do I get back to the chat?
The X at the top right of the notes, or click a channel or conversation. On phones, Back (or the back arrow) closes
the open note, then the notes.

## Friends and direct messages

Home opens on Friends when you have no conversations yet. Help (?) and the inbox are at the top right of Friends, as
in a chat. Opening Friends during a call keeps you in the call.

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

### I left a call. How do I get back in?
Open the voice channel (or stay on it): it shows who is in voice and a Join Voice button. Click it to join again.

### How do I call someone directly?
Open their profile card → Call, or open your DM with them and press the phone button at the top. Their device rings;
you see them as "Ringing…" until they join. If they decline you see "Declined", and after 30 seconds without an
answer "No answer". Calls in group chats ring everyone in the chat. Calls in a space's voice channels never ring.

### Someone is calling me. How do I answer or decline?
A call card shows who is calling. Press the green button to join, or the red one to decline (the caller sees that you
declined).

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
snapshot of their screen. Click it (or Watch Stream) to join the call with their stream shown full size. Snapshots are
only shared in unencrypted channels.

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

### How do I switch microphone or speakers quickly?
Press the small arrow next to the microphone (or headphones) under your name at the bottom left. Pick a device, or
Voice Settings for everything else.

### My microphone doesn't work.
Settings → Audio → Microphone test shows the level. Check the right microphone is chosen in Voice settings during a
call, and that your system allows Meadhall to use the microphone.

### How do I use the game overlay?
On the desktop app, press Shift and ` (the key left of 1) together, in any game or app. If another app already uses
that key, Meadhall uses Ctrl+Shift+` (or Shift+F10); the Game overlay button under "Voice Connected" also opens it and
shows which key works. The overlay has the call buttons at the top and widgets: Voice (who is talking; click someone
to change their volume), Text chat (pick a conversation, read it and type to send; pictures show in the chat, click
one to see it large and press Esc to close it), Notifications (mentions and DMs, with their pictures) and Soundboard. Drag a widget by its title to move it. The gear shows or hides widgets and changes the opacity. The pin
on a widget keeps it on screen after you close the overlay, while you play (it doesn't take your mouse). Press Esc or
the shortcut again to close. It works over games in windowed or borderless fullscreen mode, not exclusive fullscreen.

### What is the campfire?
The flames around someone's picture while they talk. Turn it into a simple ring in Settings → Audio → Speaking campfire.

## Profile and status

### How do I change my name or picture?
Settings → Profile. Change your display name, avatar, banner, About me and links.

### How do I set a status?
Click your name at the bottom left. Choose Online, Away, Do Not Disturb or Invisible, or set a custom status.

### How do I show what game I'm playing?
Settings → Privacy & Safety → Activity. Meadhall can show the game you're playing (Steam and detected games) and who may
see it. While you're Invisible, nobody sees what you're playing. It stops showing as soon as the game closes.

### Why don't I see someone's status?
People who are offline or Invisible show no status and no game, like on Discord.

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

### How do I make the side panels wider or narrower?
Drag the edge of the panel: the right edge of the channel / Direct Messages list, or the left edge of the member list
and profile panel (desktop and wide windows). Meadhall remembers each width. The chat in the middle always keeps enough
room; names and message previews shorten with "…" when a panel is narrow.

### Where did the buttons at the top of the chat go?
In a small window (or on a phone) the top of the chat keeps the call button, the inbox and ...; Search, Pins, Notes,
Members, Channel info and Help move into the ... menu. Make the window wider to get them back in the bar.

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
Space Settings → Reports. Open a report, or pick someone under Member records. Warn, shadow mute, kick or ban; or mute
or ban for a set time (choose how long under For a set time). The person gets a message saying what happened and why.
Member records show everything done to someone, including what the Meadhall bot did with /warn, /timeout, /kick and
/ban.

### How do I set up onboarding (rules and questions for newcomers)?
Space Settings → Onboarding. Turn it on, write rules and questions; answers can give roles. Use Preview as a newcomer to
see it, since admins and moderators skip it. "Require it" means only people with the member role can talk.

### How do I set up auto-mod?
Space Settings → Auto-mod. Block words, links and mention spam, and choose delete, warn or time out. It needs a bot
(works around the clock). Without one, you can tick "Let moderators' Meadhall enforce auto-mod": then a moderator's
Meadhall does it while they are online.

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
