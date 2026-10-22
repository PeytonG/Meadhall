# Contributing to Meadhall

Thanks for helping! Bug reports, ideas, pixel art and code are all welcome.

## Reporting bugs and ideas

Open an [issue](https://github.com/PeytonG/Meadhall/issues/new/choose) using a template. For bugs, include your
platform (web / Windows / Linux / Android), the Meadhall version (Settings → Updates on desktop) and steps to
reproduce. **Security problems** go through private reporting instead; see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. `pnpm install` (Node.js 22+, pnpm 10).
3. Make your change. Keep pull requests focused: one fix or feature each.
4. Run the checks:
   ```bash
   pnpm typecheck
   pnpm --dir apps/web test
   pnpm --dir apps/web test:smoke
   # if you touched Matrix, voice or UI flows (needs Docker):
   node scripts/test-synapse.mjs start
   pnpm --dir apps/web test:integration
   pnpm --dir apps/web test:e2e
   ```
5. Open a pull request and describe what changed and why. CI runs everything above plus security scans.

## Guidelines

- **Match the surrounding code**: TypeScript strict, React function components, the existing naming and comment
  style. Explain *why* in comments, not *what*.
- **Add tests** for behavior changes; the test suites live in `apps/web/test` and `apps/web/e2e`.
- **License headers:** every new file starts with `SPDX-License-Identifier: AGPL-3.0-only` in a comment. By
  contributing you agree your contribution is licensed under the AGPL-3.0.
- **Compatibility:** don't rename Matrix event types (`com.heorot.*`, `org.heorot.*`) or storage keys (`heorot.*`).
  They keep Meadhall compatible with Heorot and keep users signed in. See [CLAUDE.md](CLAUDE.md) for the full list
  and the reasoning behind other design decisions.
- **Pixel art:** UI should follow the pixel theme in `apps/web/src/ui/styles/pixel.css` and use theme tokens
  (`var(--accent)` etc.), never hard-coded colors, so the color wheel keeps working. Stickers are sprites in
  `scripts/generate-stickers.mjs`; app icons come from `branding/` via `scripts/generate-branding.mjs`.
- **Commits:** small and descriptive, explaining the reason for the change.

## Getting help

Ask in an issue, or look through [CLAUDE.md](CLAUDE.md) for architecture notes.
