# Meadhall bot

A bot for Meadhall servers: **onboarding** (gives roles once a new member accepts the rules and answers the
questions), **welcome messages**, **auto-mod** (blocked words, links, mention spam) and **moderation commands**
(`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/rules`, `/help`). Everything is set up per server in
Meadhall, under Server Settings → Onboarding, Auto-mod and Bots. The bot only works in servers whose admins added it.

## Run it

1. Make a Matrix account for the bot on your homeserver (for example `@meadhall-bot:example.org`).
2. Start the bot (Node 22.18 or newer runs it directly, no build step):

   ```sh
   cd apps/bot
   MEADHALL_BOT_HOMESERVER=https://matrix.example.org \
   MEADHALL_BOT_USER=meadhall-bot \
   MEADHALL_BOT_PASSWORD='…' \
   node src/main.ts
   ```

   Or with Docker, from the repository root:

   ```sh
   docker build -f apps/bot/Dockerfile -t meadhall-bot .
   docker run -d --restart unless-stopped --name meadhall-bot \
     -e MEADHALL_BOT_HOMESERVER=https://matrix.example.org \
     -e MEADHALL_BOT_USER=meadhall-bot \
     -e MEADHALL_BOT_PASSWORD='…' meadhall-bot
   ```

3. In Meadhall, open your server's **Server Settings → Bots**, enter the bot's Matrix ID and give it a role that can
   **manage roles**, **kick**, **ban** and **manage messages** (ranked above the roles it should give). The bot joins
   and its commands appear when anyone types `/`.

## What it needs and keeps

- **Rights:** it can only do what its role allows, and never acts on anyone ranked at or above it. Moderation
  commands also check that the person asking may do it themselves.
- **Sessions:** it signs in as a new session each start (its encryption keys live in memory) and removes its
  earlier sessions, so it can read encrypted channels it's in. Messages from before it started aren't read.
- **Data:** running timeouts are kept in the bot account's own account data, so a restart still ends them. It keeps
  nothing else. Members' onboarding answers are stored in the server (visible to its members), not by the bot.
- `MEADHALL_BOT_DEBUG=1` logs the type of every event it sees (no message contents).

## For bot developers

Any Matrix bot can work with Meadhall: list it in Server Settings → Bots, and send your commands as state in the
server's space room: type `io.github.peytong.meadhall.commands`, state key = your bot's user ID, content
`{"commands": [{"name": "roll", "description": "Roll a die", "options": [{"name": "sides", "type": "number"}]}]}`
(option types: `text`, `user`, `number`, `choice` with `choices`). When someone runs one, the message's content has
`io.github.peytong.meadhall.command: {"bot": "@you:…", "name": "roll", "args": {"sides": "20"}}` next to the typed
text. The formats and limits are in `apps/web/src/core/bots/botProtocol.ts`.
