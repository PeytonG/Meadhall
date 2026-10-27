# Privacy policy

Meadhall is a client: it talks to the Matrix homeserver **you** choose, and to nothing else unless you turn
something on. There is no Meadhall server, no analytics and no telemetry.

## What goes where

| What | Where it goes | When |
|---|---|---|
| Your messages, profile, calls and settings that sync | Your homeserver (and, through Matrix federation, the servers of people you talk to) | Always: that's the chat |
| Messages in encrypted chats | Only the people in the conversation can read them (end-to-end encrypted) | Always, in encrypted chats (DMs are encrypted) |
| Voice and video | Your homeserver's call service (LiveKit) | When you join a call |
| Link previews | Your homeserver fetches the page, so it sees the link | Only in unencrypted chats by default (Settings → Privacy → Link previews) |
| What you're playing / listening to | Depends on Settings → Privacy → Activity: nobody, people you DM (encrypted), people you share a chat with, or everyone | Only while sharing is on; Steam is on by default, Rich Presence, game detection and media are off by default |
| A GIF you paste | Meadhall downloads it from the link it was copied from, then uploads it to your homeserver | When you paste a copied GIF |
| Bug reports | A room on your homeserver, sent to the account the app was built to report to | Only when you send a report (Settings → Report a bug) |
| Update checks (desktop and Android) | GitHub (this project's releases) | Every few hours; Settings → Updates can hide the notice, but the check itself can't be turned off yet |

## On your device

Meadhall keeps your session, encryption keys and settings on your device (encrypted where the platform allows).
Signing out removes them.

## Rich Presence and game detection (desktop)

When turned on, Meadhall listens on this computer only (a named pipe/socket and `127.0.0.1`) for apps that report
their activity the way they would to Discord, and/or reads the list of running programs to recognise games. Names
come from a list built into the app; nothing is looked up online. What is shared, and with whom, is up to you.

## Questions

Open an issue at https://github.com/PeytonG/Meadhall/issues, or see [SECURITY.md](../SECURITY.md) for security
reports.
