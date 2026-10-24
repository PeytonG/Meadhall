// SPDX-License-Identifier: AGPL-3.0-only
// Official Meadhall badges (owner only). Who has which badge is kept privately on the owner's machine; the repo only
// gets badges/badges.json: salted, deliberately slow fingerprints of the user IDs (not the IDs), signed with the owner's
// private key. The app checks the signature with the public key built into it (src/core/badges/badgeKey.ts), so only
// the owner can make official badges, and reading the file doesn't reveal who has them.
//
// Usage (from the repo root):
//   node scripts/badges.mjs init                      create the signing key (once) and print the public key
//   node scripts/badges.mjs grant @user:server founder
//   node scripts/badges.mjs revoke @user:server founder
//   node scripts/badges.mjs list                      who has what (from the private file)
//   node scripts/badges.mjs publish                   write badges/badges.json (new salt every time)
// Then commit and push badges/badges.json. Set MEADHALL_BADGE_DIR to keep the private files somewhere else.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = process.env.MEADHALL_BADGE_DIR ?? path.join(os.homedir(), "Documents", "Meadhall-badge-signing");
const keyFile = path.join(privateDir, "badge-signing-key.pem");
const holdersFile = path.join(privateDir, "badge-holders.json");
const outFile = path.join(repoRoot, "badges", "badges.json");

// Must match src/core/badges/badges.ts.
const BADGES = new Set(["founder"]);
const ITERATIONS = 50_000;

function readHolders() {
    try {
        return JSON.parse(fs.readFileSync(holdersFile, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

function writeHolders(holders) {
    fs.writeFileSync(holdersFile, `${JSON.stringify(holders, null, 2)}\n`, { mode: 0o600 });
}

function checkUserId(userId) {
    if (!/^@[^:\s]+:\S+$/.test(userId ?? "")) throw new Error(`Not a Matrix user ID: ${userId}`);
    if (userId !== `${userId.split(":")[0].toLowerCase()}:${userId.split(":").slice(1).join(":")}`) {
        console.warn(`Note: ${userId} has capital letters; Matrix IDs are almost always lowercase.`);
    }
}

// Same as fingerprint() in src/core/badges/badges.ts.
function fingerprint(userId, salt) {
    return crypto.pbkdf2Sync(userId, Buffer.from(salt, "base64"), ITERATIONS, 32, "sha256").toString("base64url");
}

function publicKeyBase64(privateKey) {
    return crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64");
}

const [command, userId, badge] = process.argv.slice(2);
fs.mkdirSync(privateDir, { recursive: true });

switch (command) {
    case "init": {
        // "wx": create only if it doesn't exist yet, so an existing key is never replaced (no check-then-write race).
        const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
        try {
            fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
            console.log(`Created ${keyFile}. Back it up: without it, no new official badges can be made.`);
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
        }
        console.log(`Public key (BADGE_PUBLIC_KEY in src/core/badges/badgeKey.ts):\n${publicKeyBase64(fs.readFileSync(keyFile, "utf8"))}`);
        break;
    }
    case "grant":
    case "revoke": {
        checkUserId(userId);
        if (!BADGES.has(badge)) throw new Error(`Unknown badge "${badge}". Known: ${[...BADGES].join(", ")}`);
        const holders = readHolders();
        const current = new Set(holders[userId] ?? []);
        if (command === "grant") current.add(badge);
        else current.delete(badge);
        if (current.size > 0) holders[userId] = [...current].sort();
        else delete holders[userId];
        writeHolders(holders);
        console.log(`${command === "grant" ? "Granted" : "Revoked"} ${badge} ${command === "grant" ? "to" : "from"} ${userId}. Run "publish" next.`);
        break;
    }
    case "list": {
        for (const [id, badges] of Object.entries(readHolders())) console.log(`${id}: ${badges.join(", ")}`);
        break;
    }
    case "publish": {
        let signingKey;
        try {
            signingKey = fs.readFileSync(keyFile, "utf8");
        } catch {
            throw new Error(`No signing key at ${keyFile}. Run "init" first.`);
        }
        const salt = crypto.randomBytes(16).toString("base64");
        const entries = {};
        for (const [id, badges] of Object.entries(readHolders())) entries[fingerprint(id, salt)] = badges;
        // Shuffled, so the order says nothing about who was added when.
        const shuffled = Object.fromEntries(Object.entries(entries).sort(() => crypto.randomInt(3) - 1));
        const payload = JSON.stringify({ version: 1, issued: new Date().toISOString(), salt, iterations: ITERATIONS, entries: shuffled });
        const signature = crypto.sign("sha256", Buffer.from(payload), { key: signingKey, dsaEncoding: "ieee-p1363" }).toString("base64");
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, `${JSON.stringify({ payload, signature }, null, 2)}\n`);
        console.log(`Wrote ${path.relative(repoRoot, outFile)} (${Object.keys(entries).length} people). Commit and push it.`);
        break;
    }
    default:
        console.log("Usage: node scripts/badges.mjs init | grant <@user:server> <badge> | revoke <@user:server> <badge> | list | publish");
        process.exitCode = command ? 1 : 0;
}
