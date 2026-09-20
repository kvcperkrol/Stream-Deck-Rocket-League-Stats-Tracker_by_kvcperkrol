/** Pure helpers for Stream Deck's profile file format (kept side-effect free so tests can import them). */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTVW";

/**
 * Stream Deck names each page folder after the page UUID: the 128 bits are left-aligned into 130 bits,
 * written as 26 base32 digits (alphabet 0-9A-TVW) and suffixed with "Z".
 * Verified against a page shipped in another plugin's profile: e84126e6-de95-49bf-a812-93359e423de4 → T10IDPMVIL4RWA0IICQPSGHTSGZ.
 */
export function pageDirName(uuid: string): string {
	let n = BigInt("0x" + uuid.replace(/-/g, "")) << 2n;
	let out = "";
	for (let i = 0; i < 26; i++) {
		out = ALPHABET[Number(n & 31n)] + out;
		n >>= 5n;
	}
	return out + "Z";
}
