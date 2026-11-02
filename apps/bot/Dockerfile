# SPDX-License-Identifier: AGPL-3.0-only
# The Meadhall bot. Build from the repository root: docker build -f apps/bot/Dockerfile -t meadhall-bot .
FROM node:24-alpine
WORKDIR /meadhall
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json apps/bot/
RUN pnpm install --filter @heorot/bot --prod --frozen-lockfile
COPY apps/bot/src apps/bot/src
# The bot shares the app's formats and role logic (plain TypeScript, no imports).
COPY apps/web/src/core/bots/botProtocol.ts apps/web/src/core/bots/
COPY apps/web/src/core/roles/roles.ts apps/web/src/core/roles/
USER node
WORKDIR /meadhall/apps/bot
CMD ["node", "src/main.ts"]
