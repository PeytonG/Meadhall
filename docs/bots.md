# The Meadhall bot: complete guide

The Meadhall bot is a small program that signs in to Matrix as its own account and works for your spaces around the
clock. This guide takes you from nothing to a running bot that enforces your rules, then covers every setting,
command and problem you might hit.

**Contents**

1. [Do I need a bot?](#1-do-i-need-a-bot)
2. [Quick start (about 15 minutes)](#2-quick-start)
3. [Step 1: make the bot's account](#3-step-1-make-the-bots-account)
4. [Step 2: run the bot](#4-step-2-run-the-bot)
5. [Step 3: add it to your space](#5-step-3-add-it-to-your-space)
6. [Step 4: set up onboarding, auto-mod and welcomes](#6-step-4-set-up-what-it-does)
7. [Step 5: check that it works](#7-step-5-check-that-it-works)
8. [Commands](#8-commands)
9. [Settings reference (environment variables)](#9-settings-reference)
10. [Keeping it running and updating it](#10-keeping-it-running-and-updating-it)
11. [Troubleshooting](#11-troubleshooting)
12. [Security and privacy](#12-security-and-privacy)
13. [Writing your own bot](#13-writing-your-own-bot)

---

## 1. Do I need a bot?

Matrix homeservers don't run rules for you. Something that's online, with moderator power, has to delete a bad
message or give someone a role. In Meadhall that's either the bot or a moderator's own Meadhall app.

| | Without a bot | With the bot |
|---|---|---|
| **Auto-mod** (blocked words, links, mention spam) | Done by any moderator's Meadhall that is **open and in that channel**. Nobody online means nothing happens until later (old messages aren't checked). | Always, in every channel the bot is in. |
| **Onboarding roles** (the role new members get when they finish) | Given by a moderator's Meadhall when one is online (it catches up on everyone who finished while nobody was). | Straight away. |
| **"Require it" onboarding** (only members with the role can talk) | Works, but new members wait until a moderator is online. | Works immediately. |
| **Welcome messages** | No. | Yes. |
| **Commands** (`/warn`, `/timeout`, `/kick`, `/ban`, `/rules`, `/help`) | Moderators use Space Settings → Reports → Member records (warn, mute, kick, ban) instead. | Yes, from any Matrix app. |
| **Timeouts ending on time** | Lifted by the next moderator's Meadhall that's online. | Lifted on time. |

For a small, friendly space, no bot is fine. For a public space, or when moderators aren't online much, run the bot.

## 2. Quick start

For people who've done this before. Each step is explained in the sections below.

1. Make an account for the bot, for example `@meadhall-bot:your.server`
   (Meadhall → Settings → Server admin → Users → Create account).
2. On a computer or server that's always on, with Docker:

   ```sh
   git clone https://github.com/PeytonG/Meadhall.git && cd Meadhall
   docker build -f apps/bot/Dockerfile -t meadhall-bot .
   docker run -d --restart unless-stopped --name meadhall-bot \
     -e MEADHALL_BOT_HOMESERVER=https://your.server \
     -e MEADHALL_BOT_USER=meadhall-bot \
     -e MEADHALL_BOT_PASSWORD='the bot password' \
     meadhall-bot
   docker logs -f meadhall-bot     # wait for "signed in as ..."
   ```

3. In Meadhall: your space → Space Settings → **Roles**: make a role called **Bot** ranked **above** every role it
   should give, with **Manage roles, Kick, Ban, Manage messages**.
4. Space Settings → **Bots** → type the bot's Matrix ID → tick **Bot** → **Add bot**.
5. Space Settings → **Onboarding** and **Auto-mod**: set them up and save.
6. In any channel type `/help`. The bot answers.

## 3. Step 1: make the bot's account

The bot is an ordinary Matrix account. Use a new one only for the bot, never your own account.

**If you run the homeserver and use Meadhall's admin panel:**

1. Meadhall → **Settings → Server admin → Users**.
2. Fill in a user name (for example `meadhall-bot`) and a long random password, then press **Create account**.
3. Write the password down. The bot needs it.

**If your homeserver uses registration tokens:** sign up in Meadhall with the user name `meadhall-bot` and a token
(Settings → Server admin → Registration tokens makes one), then sign out.

**On Synapse from the command line:**

```sh
register_new_matrix_user -c /path/to/homeserver.yaml -u meadhall-bot --no-admin http://localhost:8008
```

**On someone else's homeserver** (matrix.org and others): sign up like a normal person. Some servers don't allow
bots: check their rules.

Optional but nice: sign in once as the bot in Meadhall, set a display name ("Meadhall bot") and an avatar, then
sign out.

> Don't make the bot a homeserver admin. It doesn't need it.

## 4. Step 2: run the bot

The bot has to run somewhere that's **always on**: the machine that runs your homeserver, a small VPS, a Raspberry
Pi, or a home PC that stays on. It only makes outgoing connections to your homeserver. No ports need opening.

You need the bot's **homeserver address** (what you type when you sign in, e.g. `https://matrix.example.org`), its
**user name** and its **password**.

### Option A: Docker (recommended)

Install Docker (https://docs.docker.com/get-docker/), then:

```sh
git clone https://github.com/PeytonG/Meadhall.git
cd Meadhall
docker build -f apps/bot/Dockerfile -t meadhall-bot .
docker run -d --restart unless-stopped --name meadhall-bot \
  -e MEADHALL_BOT_HOMESERVER=https://matrix.example.org \
  -e MEADHALL_BOT_USER=meadhall-bot \
  -e MEADHALL_BOT_PASSWORD='the bot password' \
  meadhall-bot
```

`--restart unless-stopped` starts it again after crashes and reboots. Watch what it does with
`docker logs -f meadhall-bot` (Ctrl+C stops watching, not the bot).

**Docker Compose**, if you already run your homeserver with it. Add to `docker-compose.yml`:

```yaml
services:
  meadhall-bot:
    build:
      context: ./Meadhall            # where you cloned Meadhall
      dockerfile: apps/bot/Dockerfile
    restart: unless-stopped
    environment:
      MEADHALL_BOT_HOMESERVER: https://matrix.example.org
      MEADHALL_BOT_USER: meadhall-bot
      MEADHALL_BOT_PASSWORD: ${MEADHALL_BOT_PASSWORD}   # put the password in a .env file next to it
```

Then `docker compose up -d meadhall-bot`. If the bot and Synapse are in the same Compose project, you can use the
internal address (for example `http://synapse:8008`) as `MEADHALL_BOT_HOMESERVER`.

### Option B: Node.js (no Docker)

Needs **Node.js 22.18 or newer** (`node --version`) and pnpm (`npm install -g pnpm`).

```sh
git clone https://github.com/PeytonG/Meadhall.git
cd Meadhall
pnpm install --filter @heorot/bot
cd apps/bot
MEADHALL_BOT_HOMESERVER=https://matrix.example.org \
MEADHALL_BOT_USER=meadhall-bot \
MEADHALL_BOT_PASSWORD='the bot password' \
node src/main.ts
```

On **Windows (PowerShell)**:

```powershell
cd Meadhall\apps\bot
$env:MEADHALL_BOT_HOMESERVER = "https://matrix.example.org"
$env:MEADHALL_BOT_USER = "meadhall-bot"
$env:MEADHALL_BOT_PASSWORD = "the bot password"
node src/main.ts
```

That runs until you close the window. To keep it running, see [section 10](#10-keeping-it-running-and-updating-it).

### What a good start looks like

The log shows the bot signing in, then a line like `working in My Space (!abc…)` for each space it's set up in.
Before you add it to a space (next step), it just signs in and waits.

## 5. Step 3: add it to your space

You need to be the space's owner or an admin (power 100 / "Manage space" and "Manage roles").

### 3a. Give the bot a role

The bot can only do what its role allows, and it never acts on anyone ranked at or above it.

1. Space Settings → **Roles** → **Create role**. Call it **Bot**.
2. Rank it **above** every role it should give out (for example above "Member" and "Verified"), and **below** your
   own admin role.
3. Tick these permissions:

   | Permission | Needed for |
   |---|---|
   | **Manage roles** | Giving onboarding roles |
   | **Manage messages** | Auto-mod deleting messages |
   | **Kick members** | `/kick`, and timeouts (they change who may talk) |
   | **Ban members** | `/ban` |
   | Invite people (optional) | Inviting newly qualified members into role-only channels |

4. Save.

### 3b. Add the bot

1. Space Settings → **Bots** → **Add a bot**.
2. Type the bot's full Matrix ID, e.g. `@meadhall-bot:matrix.example.org`.
3. Tick the **Bot** role, then **Add bot**.

Meadhall invites the bot to the space and its channels. Within a few seconds the bot accepts, and the Bots list shows
**In the space** with its commands (`/help`, `/rules`, …).

> **Only people on the bot's own homeserver can add it** by default, so strangers can't put your bot to work. If
> your space's admins are on another homeserver, see `MEADHALL_BOT_ALLOWED_INVITERS` in [section 9](#9-settings-reference).

**New channels:** channels you create in Meadhall later invite the space's bots automatically. For channels made in
another app, remove and re-add the bot in Space Settings → Bots (that invites it everywhere).

## 6. Step 4: set up what it does

### Onboarding (Space Settings → Onboarding)

- **Turn on onboarding**, write an **Introduction** and **Rules** (one per line).
- **Questions**: each answer can **give a role** (e.g. "Games night" gives the "Gamers" role). The bot's role must
  rank above those roles.
- **Member role and gate**:
  - **Ask first**: Meadhall shows onboarding before newcomers write. Other Matrix apps don't stop anyone.
  - **Require it**: only people with the member role can talk in any channel, and the homeserver enforces it in
    every app. Tick **Give the role to everyone already here** so current members can keep talking. The bot gives
    the role when someone finishes.
- **Preview as a newcomer** shows you what new people see. Admins and moderators skip onboarding, so you'll never
  see it otherwise.

### Auto-mod (Space Settings → Auto-mod)

- **Blocked words** (whole words, any case), **block links**, **max mentions** per message.
- **What happens**: delete only, delete and warn, or delete and **time out** for N minutes.
- **Exempt rank**: roles at or above it are never checked (moderators by default).

### Welcome message (Space Settings → Onboarding → Welcome message)

Pick a channel and write a message. `{user}` becomes the newcomer's name. With onboarding on, the welcome comes when
they finish it. Without onboarding, it comes when they join.

## 7. Step 5: check that it works

1. In any channel type `/help`. The bot replies with what it can do.
2. Type `/rules`. It lists your rules.
3. **Auto-mod:** add a test word such as `bananas` to blocked words, save, then sign in as a non-moderator account
   (or ask a friend) and send "bananas". The message disappears and the bot posts a warning.
4. **Onboarding:** join with a test account. Answer the questions and check that the account gets the role (its
   name colour changes, and Space Settings → Members shows the role).

If any of these don't happen, go to [Troubleshooting](#11-troubleshooting).

## 8. Commands

Type `/` in Meadhall to see them with hints. In other Matrix apps, type them with `!` instead (`!warn @bob:example.org spam`).

| Command | Who can use it | What it does |
|---|---|---|
| `/help` | Everyone | Lists the commands |
| `/rules` | Everyone | Shows the space's rules |
| `/warn user [reason]` | Moderators (kick power) | Posts a warning to them |
| `/timeout user [minutes] [reason]` | Moderators | Stops them talking in every channel for a while (default 10 minutes) |
| `/untimeout user` | Moderators | Ends a timeout |
| `/kick user [reason]` | Kick power | Removes them from the space and channels (they can rejoin) |
| `/ban user [reason]` | Ban power | Removes them and stops them coming back |

The bot checks that the **person asking** could do it themselves, and that the target ranks below both the asker
and the bot. Commands have a 2-second cooldown per person.

## 9. Settings reference

| Variable | Required | Example | Meaning |
|---|---|---|---|
| `MEADHALL_BOT_HOMESERVER` | yes | `https://matrix.example.org` | The bot's homeserver address. Must start with `https://` (or `http://` for a local server). |
| `MEADHALL_BOT_USER` | yes | `meadhall-bot` | The bot's user name (or full ID). |
| `MEADHALL_BOT_PASSWORD` | yes | `…` | The bot's password. Keep it secret (see section 12). |
| `MEADHALL_BOT_ALLOWED_INVITERS` | no | `example.org,@alice:other.org` | Who may add the bot to a space: homeserver names and/or user IDs, comma-separated; `*` = anyone. Default: people on the bot's own homeserver. |
| `MEADHALL_BOT_DEVICE_NAME` | no | `Meadhall bot` | The session name shown in the bot account's device list. |
| `MEADHALL_BOT_DEBUG` | no | `1` | Logs the type of every event it sees (never message contents). For troubleshooting. |

Nothing else is configured on the bot. Each space's admins choose what it does there, in Space Settings.

## 10. Keeping it running and updating it

**Docker:** `--restart unless-stopped` already covers crashes and reboots.

**Linux with systemd** (Node option). Create `/etc/systemd/system/meadhall-bot.service`:

```ini
[Unit]
Description=Meadhall bot
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/Meadhall/apps/bot
ExecStart=/usr/bin/node src/main.ts
EnvironmentFile=/etc/meadhall-bot.env
Restart=always
RestartSec=10
User=meadhall-bot

[Install]
WantedBy=multi-user.target
```

Put the three `MEADHALL_BOT_…=…` lines in `/etc/meadhall-bot.env` (`chmod 600`), then
`sudo systemctl enable --now meadhall-bot`. Logs: `journalctl -u meadhall-bot -f`.

**Windows:** the simplest is Docker Desktop (set to start at login). Without Docker, use Task Scheduler: create a
task that runs at startup, "whether user is logged on or not", program `node`, arguments `src\main.ts`, start in
`C:\…\Meadhall\apps\bot`, and set the three variables as system environment variables (System Properties →
Environment Variables).

**Updating the bot** (do this when you update Meadhall, since new features can need the new bot):

```sh
cd Meadhall && git pull
# Docker:
docker build -f apps/bot/Dockerfile -t meadhall-bot . && docker rm -f meadhall-bot && docker run -d … (same as before)
# Node:
pnpm install --filter @heorot/bot && sudo systemctl restart meadhall-bot
```

Restarts are safe: running timeouts are remembered and onboarding answers sent while it was down are handled when it
comes back.

## 11. Troubleshooting

Start with the bot's log (`docker logs meadhall-bot`, `journalctl -u meadhall-bot`, or the console window).

| What you see | Why | Fix |
|---|---|---|
| Log: `Set MEADHALL_BOT_… (see apps/bot/README.md)` | A required variable is missing | Set all three (section 9). |
| Log: `M_FORBIDDEN` / `Invalid username or password` | Wrong user name or password | Sign in as the bot in Meadhall to check, then fix the variable. |
| Log: connection refused / `ENOTFOUND` | Wrong homeserver address, or the bot can't reach it | Use the address you sign in with; from inside Docker, `localhost` means the container itself. |
| Bots list says **Invited, not joined yet** | The bot isn't running, or refused the invite | Check it's running. If the log says it ignored an invite, the person who added it isn't allowed: see `MEADHALL_BOT_ALLOWED_INVITERS`. |
| `/help` does nothing | The bot isn't in that channel | Space Settings → Bots: remove and add it again (it's invited to every channel). |
| Auto-mod doesn't delete | Its role lacks **Manage messages**, or the sender ranks at or above the exempt rank or the bot | Fix the role (3a). Test with a non-moderator account. |
| Onboarding role isn't given | Its role lacks **Manage roles**, or ranks below the role to give | Move the Bot role above it (3a). The log says "A role to give is ranked at or above the bot's own role." |
| Newcomers can't talk with **Require it** | Nobody gave them the member role | The bot must be running with Manage roles. Without a bot, a moderator's Meadhall gives it when online. |
| Auto-mod misses messages in **encrypted** channels | The bot couldn't decrypt them: it's a new session each start, and only reads messages sent after it started | Normal after a restart for older messages. If new ones are missed, check the log for decryption errors, and make sure the channel isn't set to only send keys to verified sessions. |
| `/kick` or `/ban` says "you can't" | You (or the target) rank too high or too low | The asker needs that power, and the target must rank below both asker and bot. |
| Bot doesn't welcome people | Welcome off, no channel picked, or the bot isn't in that channel | Space Settings → Onboarding → Welcome message. |

Still stuck? Run with `MEADHALL_BOT_DEBUG=1` and open an issue with the log (it never contains message text).

## 12. Security and privacy

- **The password is the bot's whole account.** Keep it in an env file readable only by the bot (`chmod 600`) or a
  Docker secret. Never in a repository or a screenshot.
- **Least power:** give the Bot role only the permissions you need, ranked as low as works. It can never act on
  anyone ranked at or above it.
- **Who can use it:** by default only people on its own homeserver can add it to a space. `*` lets anyone on any
  homeserver put your bot (and your server's resources) to work, so avoid it on public bots unless you mean it.
- **Sessions:** each start signs in as a new session (encryption keys live in memory) and deletes its older sessions,
  so the device list stays clean.
- **What it keeps:** running timeouts, in the bot account's own account data. Nothing else. Onboarding answers live in
  the space (members can see them), not with the bot. Logs hold event types, never message text.
- **Stopping it:** remove it in Space Settings → Bots (it's kicked from the channels and loses its role), and stop
  the container or service.

## 13. Writing your own bot

Any Matrix bot can plug into Meadhall's slash-command menu:

1. An admin lists it in Space Settings → Bots (state event `io.github.peytong.meadhall.bots` in the space room).
2. The bot announces its commands as state in the space room: type `io.github.peytong.meadhall.commands`, state key
   = the bot's user ID, content:

   ```json
   {"commands": [{"name": "roll", "description": "Roll a die",
                  "options": [{"name": "sides", "description": "How many sides", "type": "number", "required": false}]}]}
   ```

   Option types: `text`, `user`, `number`, `choice` (with `"choices": ["a", "b"]`).
3. When someone runs one, the message's content carries
   `"io.github.peytong.meadhall.command": {"bot": "@you:…", "name": "roll", "args": {"sides": "20"}}` next to the
   typed text in `body` (people in other apps type `!roll 20`, so parse `body` too).
4. Read the space's settings from state: `io.github.peytong.meadhall.onboarding`, `.automod`,
   `.onboarding.response` (state key = member), and roles in `io.github.peytong.meadhall.roles` /
   `.member_roles`.

All formats, limits and parsers are in `apps/web/src/core/bots/botProtocol.ts`. The Meadhall bot itself
(`apps/bot/src`) is a complete example.
