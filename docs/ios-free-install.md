# Installing Meadhall on your iPhone for free (Xcode)

You don't need a paid Apple Developer account to run Meadhall on **your own** iPhone. A Mac with Xcode and a free
Apple ID are enough. Apple sets these limits on free accounts:

- **The app stops opening after 7 days.** Plug the iPhone in and press Run in Xcode again to renew it. Your
  sign-in and messages stay.
- Up to 3 of these apps per iPhone, and only on iPhones you install to yourself (no sharing a link).
- No notifications while the app is closed (that needs a paid account and a push gateway anyway).
- The "update available" button in Meadhall opens TestFlight, which won't have it: update by pulling the new code
  and pressing Run again.

## What you need

- A Mac with **Xcode** (free, from the Mac App Store; open it once and let it install its components).
- **Node.js 22 or newer** (https://nodejs.org) and **pnpm**: in Terminal, run `npm install -g pnpm`.
- **Git** (Xcode installs it; check with `git --version`).
- Your iPhone and its USB cable.

## 1. Get the code and build it

In Terminal:

```sh
git clone https://github.com/PeytonG/Meadhall.git
cd Meadhall
git checkout v0.5.0          # or any release tag; leave this out for the newest code
pnpm install
cd apps/mobile
npm run build:ios            # builds the app and copies it into the Xcode project
npx cap open ios             # opens the project in Xcode
```

The first time, Xcode spends a minute fetching packages (bottom-left shows progress). Wait until it finishes.

## 2. Sign it with your Apple ID

1. Xcode → **Settings…** → **Accounts** → **+** → **Apple ID**, and sign in.
2. In the left column click the blue **App** project, then the **App** target, then the **Signing & Capabilities** tab.
3. Tick **Automatically manage signing** and pick **Team: *Your Name* (Personal Team)**.
4. If Xcode says the bundle identifier isn't available, change **Bundle Identifier** to something only yours, such
   as `io.github.peytong.meadhall.yourname`, and press Enter.

## 3. Put it on the iPhone

1. Plug the iPhone in and unlock it. Tap **Trust** if it asks.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode** → on, then restart the iPhone when asked
   (the switch appears after you've plugged it into Xcode once).
3. In Xcode's top bar, pick your iPhone as the run destination (next to "App"), then press **▶ Run** (⌘R).
4. The first time, the iPhone refuses to open it ("Untrusted Developer"). On the iPhone go to **Settings →
   General → VPN & Device Management**, tap your Apple ID under Developer App, then **Trust**. Open Meadhall again.

After that, Meadhall is on the home screen like any app. You can unplug the iPhone.

## Every 7 days, or to update

```sh
cd Meadhall
git pull                     # only to update
pnpm install
cd apps/mobile
npm run build:ios
npx cap open ios
```

Plug the iPhone in and press **▶ Run**. Nothing else is needed (the trust step is only the first time).

## If something goes wrong

| Problem | Fix |
|---|---|
| "No profiles for 'io.github.peytong.meadhall' were found" | Step 2: pick your Personal Team; change the Bundle Identifier if it's taken. |
| "Your maximum App ID limit has been reached" | Free accounts can make 10 app IDs a week. Reuse the same Bundle Identifier each time. |
| The iPhone doesn't appear in Xcode | Unlock it, tap Trust, try another cable; Window → Devices and Simulators shows whether Xcode sees it. |
| "Developer Mode disabled" | Step 3.2. |
| The app opens to a white screen | `npm run build:ios` didn't finish: run it again and watch for errors, then Run. |
| The app won't open after a week | The 7-day limit: plug in and press Run. |
| Packages fail to resolve | Xcode → File → Packages → Reset Package Caches, then Run. |
