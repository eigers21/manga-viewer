// Utilities for OAuth 2.0 PKCE Flow

function dec2hex(dec: number) {
    return ('0' + dec.toString(16)).substr(-2);
}

function generateRandomString() {
    const array = new Uint32Array(56 / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec2hex).join('');
}

function sha256(plain: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer) {
    let str = '';
    const bytes = new Uint8Array(a);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function generateChallenge(verifier: string) {
    const hashed = await sha256(verifier);
    return base64urlencode(hashed);
}

export function generateVerifier() {
    return generateRandomString();
}
