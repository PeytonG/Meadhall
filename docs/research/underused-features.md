# Features Matrix, Synapse, LiveKit and Caddy support that clients rarely use

Requested 2026-11-03. A survey of capabilities in the stack Meadhall runs on (Matrix spec + MSCs, Synapse, LiveKit
with lk-jwt-service, Caddy, TURN, push), and which ones would help Meadhall, ranked. Items marked **(verify)** should
be checked against the current docs and versions before building. MSC = Matrix Spec Change, a proposal that some
servers and clients already implement.

## Top recommendations

| # | Feature | Why it matters for Meadhall | Effort |
|---|---|---|---|
| 1 | **LiveKit's built-in TURN** (`turn:` in livekit.yaml, TLS on 443/5349) | Calls fail behind strict NATs and corporate/school networks without TURN. LiveKit ships its own TURN server: one config block, no coturn | Server config |
| 2 | **Synapse spam-checker module** (`check_event_for_spam`) | **Auto-mod on the server, no bot and no moderator online.** A small Python module reads the space's `io.github.peytong.meadhall.automod` state and rejects matching messages before anyone sees them. The real answer to "auto-mod without a bot" for self-hosters | Medium (Python module + docs) |
| 3 | **Policy lists (MSC2313) + Draupnir** | Shared ban lists across spaces and servers (`m.policy.rule.user/room/server`). Meadhall could show and edit a space's policy list in Space Settings, and Draupnir enforces it | Medium |
| 4 | **Restricted join rules** (`join_rule: restricted`, `allow: [{type: m.room_membership, room_id: <space>}]`, room v8+) | Discord-like: everyone in the space can join its channels without separate invites. Simplifies invites and onboarding (fewer of the "channels invited behind your back" problems) | Small |
| 5 | **UnifiedPush** (Matrix push gateway via ntfy or a distributor app) | Notifications on Android without Google and without Meadhall's background service; fits F-Droid. Needs a UnifiedPush gateway (ntfy's built-in Matrix gateway) | Medium |
| 6 | **Sygnal + APNs/FCM** | iPhone notifications (required for iOS) and battery-friendly Android push | Server + app |
| 7 | **LiveKit Ingress (RTMP/WHIP)** | "Go Live" from OBS into a voice channel, like streaming software into Discord | Medium |
| 8 | **LiveKit Egress** | Record a call or stream a voice channel to YouTube/Twitch, server-side | Medium |
| 9 | **Track processors** (`@livekit/track-processors`: background blur and replacement) and noise suppression | Discord-like camera background blur. Krisp noise cancellation is LiveKit Cloud only (verify), but WebRTC's own noise suppression plus RNNoise (WASM) work self-hosted | Small–medium |
| 10 | **Room upgrades + tombstones** | Upgrade old spaces/channels to room v12 from Meadhall (Space Settings → Advanced), keeping members via the predecessor link | Small |
| 11 | **`auto_join_rooms`** (Synapse) | New accounts on the owner's homeserver automatically join a welcome space | Config |
| 12 | **Message retention** (`m.room.retention`, Synapse `retention:` config) | Disappearing messages per channel (e.g. delete after 7 days), enforced by the server | Small (UI) + config |
| 13 | **Room summary (MSC3266)** | Preview a space or channel from a link before joining (name, topic, member count), like Discord invite cards | Small |
| 14 | **Dehydrated devices (MSC3814)** | Encrypted messages sent while all your devices are offline can still be decrypted later (fewer "couldn't decrypt") **(verify Synapse and js-sdk support)** | Medium |
| 15 | **QR login with key transfer (MSC4108, secure channel + secrets sharing)** | Backlog §10.7 #7: sign in a new device and bring cross-signing and backup keys along. Needs MSC4108 on the homeserver (Synapse `experimental_features`, usually with MAS) **(verify)** | Medium–large |

## Matrix (spec and MSCs)

- **Knocking** (`join_rule: knock`): "Request to join" for private spaces, approved by moderators, like Discord
  membership screening. Pairs with onboarding.
- **Intentional mentions** (`m.mentions`, MSC3952): already sent by Meadhall. Make sure push rules use them, so
  @room and replies notify correctly.
- **Private read receipts** (`m.read.private`): "Send read receipts" off, like Discord DMs (no receipts). One setting.
- **Room tags** (`m.favourite`, `m.lowpriority`, `u.*`): favourites and folders for DMs and rooms, synced across
  devices.
- **Per-room keyword push rules**: notify on keywords (your nickname, "raid") in a channel.
- **Location sharing** (`m.location`, MSC3488 live location): share a place or live location in a DM.
- **Voice messages** (MSC3245, `org.matrix.msc3245.voice` on `m.audio`): hold-to-record, like Discord's mobile voice
  messages. Element and FluffyChat show them as playable waveforms.
- **Custom emoji and sticker packs** (MSC2545, `im.ponies.*`): already used. Space-wide packs that every member sees
  match Discord's server emoji.
- **Reporting** (MSC4151 room reports, MSC4260 user reports): send DM reports to the homeserver admin (already on the
  roadmap).
- **Invite blocking** (MSC4155): stop invites from strangers, a Discord-like "Allow DMs from server members" setting
  **(verify Synapse support)**.
- **Sticky events (MSC4354)**: newer MatrixRTC memberships may move from state to sticky events. Meadhall's
  call-member reading (`callMembersFromState`) will need to handle both **(watch Element Call releases)**.
- **Delayed events (MSC4140)**: already used for leaving calls cleanly. Could also do scheduled messages
  ("send at 9am") and auto-ending statuses.
- **Account data** for settings sync: Meadhall syncs its look this way. Notification sounds and other settings
  could sync the same way.
- **Sliding sync (MSC4186, native in Synapse)**: much faster start-up for big accounts. Blocked today by presence
  and lazy room lists (§10.5). Revisit when presence works with it.

## Synapse

- **Admin API**: now in Meadhall's admin panel. Still unused: **event reports' "resolved" state**, **room purge
  status**, **media quarantine by room**, **user `login as`** (impersonation for support), **background updates
  control**.
- **`room_list_publication_rules`**: the room directory refused admins in tests (the default denies publishing). The
  bot guide or admin guide should show the snippet that allows admins and moderators.
- **Third-party rules / spam-checker modules**: server-side auto-mod (top recommendation 2), invite checks
  (`user_may_invite`), and "only members of space X may create rooms".
- **Server notices** (used), **consent tracking** (terms of service on sign-up), **account validity** (expiring
  guest accounts).
- **Email notifications** (email pusher): "you have unread messages" emails for people who are away, like
  Discord's.
- **`encryption_enabled_by_default_for_room_type`**: decide deliberately. Meadhall now handles encrypted
  moderation logs.
- **`max_event_delay_duration`**: must be set for MatrixRTC's delayed leave events. Check the owner's config.
- **Presence federation and `presence.enabled`**: affects the online dots across servers (§7.10).
- **Workers** (when the server grows): sync and media workers keep calls and chat responsive.

## LiveKit (and lk-jwt-service)

- **Built-in TURN** (top recommendation 1). Also `rtc.use_external_ip` and UDP port ranges for NAT traversal.
- **Simulcast/dynacast/adaptive stream**: already on. **SVC codecs (VP9, AV1)** for screen share: sharper text at
  low bandwidth **(verify browser support: AV1 encoding in Chromium/Electron)**.
- **Data packets / data channels**: low-latency call events (reactions, raised hand, soundboard cues, "who's typing
  in call chat") without Matrix round-trips. Element Call disables data-channel encryption, so match that.
- **Track subscription permissions**: "only these people can watch my stream" (private streams).
- **Connection quality and speaker events**: show a signal-bars indicator per person, like Discord.
- **Ingress / Egress** (top recommendations 7–8).
- **Agents framework**: an AI voice bot in a channel (transcription, moderation, music bot) running server-side.
- **lk-jwt-service `LIVEKIT_FULL_ACCESS_HOMESERVERS`**: lists which homeservers may *create* calls on the owner's
  SFU. Others can only join existing ones, which is what cross-homeserver calls need (§10.6 #16).

## Caddy

- **Automatic HTTPS** (already in use), plus **HTTP/3 (QUIC)** for faster media loading on phones.
- **`respond` for `.well-known/matrix/client` and `/server`**: serve `org.matrix.msc4143.rtc_foci` from Caddy, so
  calls are discovered without client config.
- **`encode zstd gzip`** and long cache headers for the web build. **Security headers**: CSP, HSTS,
  `Permissions-Policy` allowing camera, microphone and display-capture only where needed.
- **Rate limiting** (the `caddy-ratelimit` plugin) on `/login` and `/register` against brute force.
- **WebSocket and long-poll proxying** for `/sync` with sensible timeouts. **layer4** plugin if TURN must share
  443.

## Suggested order

1. Server: LiveKit TURN, `max_event_delay_duration`, `room_list_publication_rules`, `auto_join_rooms` (an
   afternoon).
2. App: restricted join rules for new channels, private read receipts, room tags/favourites, voice messages.
3. Moderation: a Synapse spam-checker module that enforces Meadhall's auto-mod state, then policy lists.
4. Push: Sygnal (needed for iOS), then UnifiedPush for Android/F-Droid.
5. Streaming: Ingress (OBS → voice channel), then Egress (recording and restreaming).
