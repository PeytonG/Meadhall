import { encodeUnpaddedBase64 } from "matrix-js-sdk/src/base64";

export interface EncryptedPickleKey {
    encrypted?: BufferSource;
    iv?: BufferSource;
    cryptoKey?: CryptoKey;
}

// "userId|deviceId" as bytes, each UTF-16 code unit truncated to a byte (Element's format; public/sw.js has the
// same function and must match). Built without computed-index writes.
export function getPickleAdditionalData(userId: string, deviceId: string): Uint8Array {
    const joined = `${userId}|${deviceId}`;
    return Uint8Array.from({ length: joined.length }, (_, index) => joined.charCodeAt(index));
}

export async function encryptPickleKey(
    pickleKey: Uint8Array,
    userId: string,
    deviceId: string,
): Promise<EncryptedPickleKey | undefined> {
    if (!crypto?.subtle) {
        return undefined;
    }

    const cryptoKey = await crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"],
    );

    const iv = new Uint8Array(32);
    crypto.getRandomValues(iv);

    const additionalData = getPickleAdditionalData(userId, deviceId);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, cryptoKey, pickleKey);

    return { encrypted, iv, cryptoKey };
}

export async function buildAndEncodePickleKey(
    data: EncryptedPickleKey | undefined,
    userId: string,
    deviceId: string,
): Promise<string | undefined> {
    if (!crypto?.subtle || !data?.encrypted || !data.iv || !data.cryptoKey) {
        return undefined;
    }

    try {
        const additionalData = getPickleAdditionalData(userId, deviceId);
        const keyBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: data.iv, additionalData },
            data.cryptoKey,
            data.encrypted,
        );

        return encodeUnpaddedBase64(new Uint8Array(keyBuffer));
    } catch {
        return undefined;
    }
}
