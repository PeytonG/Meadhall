// SPDX-License-Identifier: AGPL-3.0-only
// The public half of the Meadhall owner's badge signing key (ECDSA P-256, SPKI, base64). Only lists signed with the
// matching private key, which never leaves the owner's machine, show as official badges. Made with
// `node scripts/badges.mjs init`.
export const BADGE_PUBLIC_KEY =
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjO+xXq6iAr9xuXPlrZwIB3aRGiju3S2Uh92+a/Fyg4X38dFFtYnuVsP8rR2A+bsI1d5eDOu/VhNE6/1kFbo2wQ==";

// Where the signed list is published (badges/badges.json in the official repository).
export const BADGE_LIST_URL = "https://raw.githubusercontent.com/PeytonG/Meadhall/main/badges/badges.json";
