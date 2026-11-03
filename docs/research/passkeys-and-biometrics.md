# Passkeys, fingerprints and Windows Hello for Meadhall (exploration, not built)

Requested 2026-11-03: explore (don't implement) fingerprint sign-in on phones, Windows Hello, and built-in passkeys,
including what they would have to hold. Items marked **(verify)** need checking against current docs before building.

## Two different things people mean

1. **Unlocking Meadhall with a fingerprint / face / Windows Hello ("app lock").** The account stays signed in as
   today. The device's secure hardware guards the saved session, and opening the app asks for the fingerprint first.
   This needs **no homeserver changes** and works with every Matrix server.
2. **Signing in to the account with a passkey (WebAuthn/FIDO2) instead of a password.** This is a homeserver
   feature. Meadhall can only offer it where the server supports it.

## 1. App lock (recommended first)

| Platform | How | What it protects |
|---|---|---|
| Android | `BiometricPrompt` + an Android Keystore key with `setUserAuthenticationRequired(true)`. The key wraps the stored session (Capacitor plugin, ours or a maintained one such as a biometric-auth plugin) | Access token, refresh token, device ID, and the key that unlocks the encryption store |
| iOS | `LocalAuthentication` (Face ID / Touch ID) + a Keychain item with `.biometryCurrentSet` access control | Same |
| Windows | Windows Hello via `UserConsentVerifier` (a small native module) **or** Electron's WebAuthn with a platform authenticator; the session itself is already encrypted with Electron `safeStorage` (DPAPI) | Same |
| macOS | Touch ID via `systemPreferences.promptTouchID()` (Electron) + Keychain | Same |
| Linux | No common biometric API. Fall back to the OS keyring (libsecret, which Electron `safeStorage` uses) and an app PIN | Same |

**What would be stored (per account), all behind the biometric-gated key:**
- the access token, the refresh token (if the server issues one) and its expiry
- the device ID and user ID (not secret, but kept together)
- the **pickle key** that encrypts the Rust crypto store in IndexedDB (Olm/Megolm sessions, cross-signing private
  keys if cached, key-backup key). Today this key lives with the session. Wrapping it means a stolen disk can't open
  the encrypted message history.
- optionally the **recovery key**, only if the user opts in. Leaving it out is safer: it unlocks everything on any
  device.

**Behaviour to copy from Signal and Discord:** lock after X minutes in the background or on every start (a setting),
with a fallback (device PIN or Matrix password). Hide message previews in notifications while locked, and keep
voice-call notifications working.

**Effort:** medium. One cross-platform "secure session store" interface with three native implementations, then a
lock screen. No server work.

## 2. Passkey sign-in (needs the homeserver)

- **Legacy Synapse login** (`/login` with `m.login.password`, `m.login.token`, SSO) **has no WebAuthn login type.**
  There is no standard way for a client to sign in with a passkey against plain Synapse.
- **Next-gen Matrix auth (MSC3861, OIDC via Matrix Authentication Service, "MAS")** moves sign-in into the
  provider's web pages. MAS has been adding passkey (WebAuthn) support **(verify the current MAS version and
  whether it's still experimental)**. With MAS, Meadhall would open the system browser or an in-app browser tab for
  sign-in (OAuth 2.0 authorization code + PKCE), and the passkey prompt happens there. Android, iOS and Windows
  passkey managers then work automatically, including synced passkeys (Google Password Manager, iCloud Keychain,
  Windows Hello).
- An **upstream identity provider** in front of Synapse/MAS (Keycloak, Authentik, Authelia, Zitadel) can offer
  passkeys today, through SSO. Meadhall's sign-in already falls back to SSO for MAS servers (§10 in CLAUDE.md), so
  this works without app changes once the server is set up.

**What Meadhall would need for OIDC-native login (MSC3861/MSC2964-2967):**
- discovery (`/auth_metadata`, previously the `.well-known` `m.authentication` issuer), dynamic client registration
  (MSC2966) with Meadhall's client metadata (name, logo, redirect URIs: `meadhall://oauth` for desktop and Android, a
  loopback URI as desktop fallback)
- authorization code + PKCE in the system browser, then token refresh. Store the refresh token as in section 1.
- device management through the provider's account page (MAS) instead of `/devices` deletes
- matrix-js-sdk has helpers for this (OIDC flow: `registerOidcClient`, `generateOidcAuthorizationUrl`,
  `completeAuthorizationCodeGrant`, token refresher) **(verify against js-sdk 40+)**

**Effort:** larger. Login, registration and device management all change for OIDC servers. Password login has to
stay for legacy servers. Nothing to build on the owner's homeserver until it runs MAS.

## Security notes

- A biometric never leaves the device. The app only gets "unlocked: yes/no" and the release of a key.
- App lock doesn't protect against malware running as the user while Meadhall is unlocked. It does protect against
  a lost or stolen device and casual access.
- Never put the recovery key in plain storage. Gate it behind biometrics only if the user asks.
- Passkeys tied to MAS are phishing-resistant (bound to the provider's domain). Meadhall must open the real provider
  URL in a browser it doesn't control, not an embedded login page that imitates it.

## Recommendation

1. Build **app lock** first (all platforms, no server changes; it also lets the session keys be wrapped properly).
2. Add **OIDC-native login** when the owner's homeserver moves to MAS. Passkeys then come for free through the
   provider.
3. Don't invent a custom passkey login against Synapse: it wouldn't interoperate and would bypass Synapse's auth.
