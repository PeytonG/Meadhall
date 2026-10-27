# Packaging

Store and repository packages that are built from Meadhall's releases. None of them are published by the release
workflow; each needs a manual step (a pull/merge request to the store's own repository).

## Flathub (`flatpak/`)

`io.github.peytong.meadhall.yml` repackages the release `.deb` on Flathub's Electron base app, with the AppStream
metadata and desktop file next to it.

1. After a release is published: `node scripts/flatpak-manifest.mjs 0.4.0` (downloads the `.deb`, checks it
   against `SHA256SUMS.txt`, writes the URL and sha256 into the manifest).
2. Test locally (Linux; checked with Flathub's CI image: builds, AppStream valid, `flatpak-builder-lint manifest` clean. A local
   `lint repo` also reports `appstream-screenshots-not-mirrored-in-ostree`, which only Flathub's own build fixes):
   `flatpak-builder --user --install-deps-from=flathub --force-clean --install build packaging/flatpak/io.github.peytong.meadhall.yml`
3. First time: open a pull request to [flathub/flathub](https://github.com/flathub/flathub) (branch `new-pr`) with
   the three files, per Flathub's [submission guide](https://docs.flathub.org/docs/for-app-authors/submission).
   Flathub then keeps the app in its own repo (`flathub/io.github.peytong.meadhall`); later releases are a PR there.

Inside Flatpak, Meadhall doesn't update itself (Flathub does). Known sandbox limits: "Detect games" can't see
programs outside the sandbox, and Rich Presence only reaches apps that can see Meadhall's socket (Flatpak'd games
need `--filesystem=xdg-run/discord-ipc-0`).

## F-Droid (`fdroid/`) and Obtainium

- **Obtainium** works today: add `https://github.com/PeytonG/Meadhall` in Obtainium and it installs and updates the
  signed APK from GitHub Releases
  ([one-tap link](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/PeytonG/Meadhall)).
- **F-Droid** builds apps itself from source. `fdroid/io.github.peytong.meadhall.yml` is a draft build recipe for a
  merge request to [fdroiddata](https://gitlab.com/fdroid/fdroiddata); the store listing (description, icon,
  screenshot, changelogs) comes from `fastlane/metadata/android` in this repo. Meadhall has no Google services, so
  no anti-features are expected. F-Droid signs its builds with its own key, so its APK can't update over the GitHub
  one (or the other way round).
