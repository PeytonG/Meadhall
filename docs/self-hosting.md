# Self-hosting Meadhall

Meadhall is a static web app (plus optional desktop and Android apps) that talks to a Matrix homeserver. A complete
setup has three parts:

```
 Meadhall (web / desktop / Android)  ──>  Matrix homeserver (Synapse)        accounts, messages, encryption
                                     ──>  lk-jwt-service  ──>  LiveKit SFU   voice (MatrixRTC, shared with Element Call)
```

You can also skip the server work entirely: point the app at an existing homeserver (e.g. matrix.org) and voice
uses whatever MatrixRTC backend that server advertises.

## 1. Homeserver

Any Matrix homeserver works; [Synapse](https://element-hq.github.io/synapse/latest/setup/installation.html) is the
most tested. For voice calls, enable delayed events (used to clean up call memberships when someone drops):

```yaml
# homeserver.yaml
max_event_delay_duration: 24h
experimental_features:
  msc4140_enabled: true      # delayed events
rc_delayed_event_mgmt:
  per_second: 1
  burst_count: 20
```

Check the [Element Call self-hosting guide](https://github.com/element-hq/element-call/blob/livekit/docs/self-hosting.md)
for the current list of recommended Synapse settings; Meadhall's calls need the same ones.

**Letting people sign up:** with `enable_registration: true` and `registration_requires_token: true`, create invite
tokens through the admin API:

```bash
curl -X POST "https://matrix.example.com/_synapse/admin/v1/registration_tokens/new" \
  -H "Authorization: Bearer <admin access token>" -H "Content-Type: application/json" \
  -d '{"uses_allowed": 10}'
```

People enter the token on Meadhall's Register tab.

## 2. The web app

```bash
git clone https://github.com/PeytonG/Meadhall.git && cd Meadhall
pnpm install
cp apps/web/config.example.json apps/web/config.json
pnpm build:web
```

Edit `apps/web/config.json` before building (or put it next to the built files afterwards):

```json
{
  "default_server_config": {
    "m.homeserver": { "base_url": "https://matrix.example.com", "server_name": "example.com" }
  },
  "brand": "Meadhall",
  "voice_enabled": true
}
```

Serve `apps/web/dist/` with any static web server over HTTPS. For example, Caddy:

```
chat.example.com {
    root * /srv/meadhall
    file_server
}
```

Tips:
- `config.<hostname>.json` takes precedence over `config.json`, so one build can serve several domains.
- The app ships a strict Content Security Policy (in `index.html`); keep it if you customize the build.
- The desktop and Android builds bundle `apps/web/config.json` at build time.

## 3. Voice (MatrixRTC with LiveKit)

Meadhall's voice channels use the same stack as Element Call, so both apps share calls:

- **[LiveKit](https://docs.livekit.io/home/self-hosting/deployment/)**, the media server (SFU).
- **[lk-jwt-service](https://github.com/element-hq/lk-jwt-service)**, which gives Matrix users LiveKit tokens.

**LiveKit** (`livekit.yaml`): let lk-jwt-service decide who may create rooms.

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
room:
  auto_create: false
keys:
  <api key>: <api secret>
```

Open TCP 7881 and UDP 50000–60000 (or configure LiveKit's UDP mux / TURN for restrictive networks).

**lk-jwt-service:**

```bash
docker run -d -p 8080:8080 \
  -e LIVEKIT_URL="wss://livekit.example.com" \
  -e LIVEKIT_KEY="<api key>" -e LIVEKIT_SECRET="<api secret>" \
  -e LIVEKIT_FULL_ACCESS_HOMESERVERS="example.com" \
  ghcr.io/element-hq/lk-jwt-service:latest
```

Put it behind HTTPS (e.g. `https://matrix-rtc.example.com/livekit/jwt` → `localhost:8080`).

**Announce it** in `https://example.com/.well-known/matrix/client`:

```json
{
  "m.homeserver": { "base_url": "https://matrix.example.com" },
  "org.matrix.msc4143.rtc_foci": [
    { "type": "livekit", "livekit_service_url": "https://matrix-rtc.example.com/livekit/jwt" }
  ]
}
```

Meadhall finds the voice backend automatically. It checks, in order: the homeserver's MSC4143 `/rtc/transports`,
the `.well-known` entry above, `rtc_foci` in `config.json`'s `default_server_config`, then `livekit_service_url`
in `config.json`.

**Call permissions:** voice channels created by Meadhall let every member join calls. Call memberships are room
state events, so channels made elsewhere (or by older versions) may only allow moderators. A channel admin who
joins such a call sees an **Allow members to join calls** button that fixes it.

### Fallback: heorot-voice-relay

If no MatrixRTC backend is found, Meadhall falls back to Heorot's
[voice relay](https://github.com/Vitosicz/heorot-voice-relay) (`voice_service_url`, or discovered through
`org.heorot.voice` in `.well-known`). Relay calls work between Meadhall/Heorot users only, not with Element.

## Configuration reference (`config.json`)

| Key | Type | Default | Description |
|---|---|---|---|
| `default_server_config` | object | — | Default homeserver (and identity server), `.well-known` format |
| `brand` | string | `"Meadhall"` | App name in the UI: sign-in screen, page title, device names |
| `disable_guests` | boolean | `false` | Hide guest login |
| `disable_custom_urls` | boolean | `false` | Lock sign-in to the default homeserver |
| `force_verification` | boolean | `false` | Require device verification before using the app |
| `voice_enabled` | boolean | `true` | Show voice channels |
| `livekit_service_url` | string | — | MatrixRTC JWT service, if the homeserver and `.well-known` don't advertise one |
| `voice_service_url` | string | — | heorot-voice-relay base URL (fallback voice backend) |
| `livekit_ws_url` | string | — | Legacy relay setting, overridden by discovery |
| `enable_presence_by_hs_url` | object | `{}` | Map of homeserver URLs to presence on/off |
| `source_code_url` | string | this repo | Where users get the source of *your* deployment. Required by the AGPL if you host a modified version. |
