// SPDX-License-Identifier: AGPL-3.0-only
// A test stand-in for lk-jwt-service (the MatrixRTC LiveKit token service): POST /sfu/get with a Matrix OpenID
// token; it checks the token with the test Synapse (as the real one does over federation) and returns a LiveKit
// token for that user and device. Test keys only: never use this for anything real.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.LK_TOKEN_PORT ?? 7890);
const SYNAPSE_URL = process.env.SYNAPSE_URL ?? "http://localhost:8008";
const LIVEKIT_URL = "ws://127.0.0.1:7880";
// Must match scripts/test-livekit.mjs.
const KEY = "meadhall-test-key";
const SECRET = "meadhall-test-secret-that-is-at-least-32-chars";

const base64url = (value) => Buffer.from(value).toString("base64url");

function livekitToken(identity, room) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64url(
        JSON.stringify({
            iss: KEY,
            sub: identity,
            nbf: now - 10,
            exp: now + 3600,
            video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
        }),
    );
    const signature = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, cors).end();
        return;
    }
    if (request.method !== "POST" || request.url !== "/sfu/get") {
        response.writeHead(404, cors).end();
        return;
    }
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", async () => {
        try {
            const { room, openid_token: openid, device_id: deviceId } = JSON.parse(body);
            const check = await fetch(`${SYNAPSE_URL}/_matrix/federation/v1/openid/userinfo?access_token=${encodeURIComponent(openid.access_token)}`);
            if (!check.ok) throw new Error("bad OpenID token");
            const { sub: userId } = await check.json();
            // Same room naming and identity as lk-jwt-service, so MatrixRTC matches participants to members.
            const livekitRoom = crypto.createHash("sha256").update(`${room}|m.call#ROOM`).digest("base64").replace(/=+$/, "");
            response.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ url: LIVEKIT_URL, jwt: livekitToken(`${userId}:${deviceId}`, livekitRoom) }));
        } catch (error) {
            response.writeHead(401, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: String(error) }));
        }
    });
});

server.listen(PORT, "127.0.0.1", () => console.log(`LiveKit token service on http://127.0.0.1:${PORT}`));
