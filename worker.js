export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    try {
      const { messages } = await request.json();
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      let context = '';

      // DEPOSIT INIT COMMAND â€” SEP-10 + SEP-24 server-side, no SDK needed
      if (lastUserMsg === '__DEPOSIT_INIT__') {
  let debugInfo = {};
  try {
    const TREASURY_SECRET   = 'SDUDKTIKVX6NQVG7XCCUFIDI62QPO2QWMRN35LHFWYHU33IZFEAA4A55';
    const GBM7_SECRET       = 'SCAZ7NWRI2EOOBD7Z2BFYP7YNO7TPRAIIQJHY7B3ZDZPFCCE6QN7CTGK';
    const GCHQ_SECRET       = 'SBTXFQABN3XNCJJFZGOQRQO3P4USQTG2INX2UVOHWUCKRZRNRWU7FZR7';
    const TREASURY_PUBLIC   = 'GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW';
    const SEP10_URL         = 'https://mgxanchor.moneygram.com/stellarsepservice/auth';
    const SEP24_URL         = 'https://mgxanchor.moneygram.com/stellarsepservice/sep24/transactions/deposit/interactive';
    const CLIENT_DOMAIN     = 'sfe-dynasty.github.io';
    const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
    const STRKEY_ALPHABET   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    function base32Decode(s) {
      let bits = 0, val = 0;
      const out = [];
      for (const c of s.toUpperCase()) {
        const idx = STRKEY_ALPHABET.indexOf(c);
        if (idx < 0) continue;
        val = (val << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xFF); }
      }
      return new Uint8Array(out);
    }
    function secretToSeed(secret) {
      const decoded = base32Decode(secret);
      return decoded.slice(1, 33);
    }
    function publicKeyToBytes(pub) {
      const decoded = base32Decode(pub);
      return decoded.slice(1, 33);
    }
    async function sha256(data) {
      return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    }
    async function ed25519Sign(seed32, hash32) {
      const pkcs8 = new Uint8Array(48);
      const header = [0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20];
      pkcs8.set(header, 0);
      pkcs8.set(seed32, 16);
      const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
      return new Uint8Array(await crypto.subtle.sign('Ed25519', key, hash32));
    }
    function b64decode(s) {
      const bin = atob(s.replace(/-/g,'+').replace(/_/g,'/'));
      return Uint8Array.from(bin, c => c.charCodeAt(0));
    }
    function b64encode(u8) {
      let s = '';
      for (const b of u8) s += String.fromCharCode(b);
      return btoa(s);
    }
    function u32(buf, offset) {
      return ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
    }
    function setU32(buf, offset, val) {
      buf[offset]   = (val >>> 24) & 0xFF;
      buf[offset+1] = (val >>> 16) & 0xFF;
      buf[offset+2] = (val >>> 8)  & 0xFF;
      buf[offset+3] =  val         & 0xFF;
    }
    function findSigArrayOffset(buf) {
      const len = buf.length;
      // Stellar XDR: each sig = 4 (hint) + 4 (length prefix) + 64 (sig data) = 72 bytes
      for (let n = 0; n <= 5; n++) {
        const candidateOffset = len - (4 + n * 72);
        if (candidateOffset >= 4 && u32(buf, candidateOffset) === n) {
          return candidateOffset;
        }
      }
      return len - 76; // fallback: assume 1 sig (4 + 72 = 76)
    }
    async function computeTxHash(xdrBytes) {
      const networkHash = await sha256(new TextEncoder().encode(NETWORK_PASSPHRASE));
      const sigOffset = findSigArrayOffset(xdrBytes);
      const txBytes = xdrBytes.slice(4, sigOffset);
      const envTypeBytes = new Uint8Array(4);
      setU32(envTypeBytes, 0, u32(xdrBytes, 0));
      const payload = new Uint8Array(32 + 4 + txBytes.length);
      payload.set(networkHash, 0);
      payload.set(envTypeBytes, 32);
      payload.set(txBytes, 36);
      return sha256(payload);
    }
    function appendSignature(xdrBytes, hint4, sig64) {
      const sigOffset = findSigArrayOffset(xdrBytes);
      const currentCount = u32(xdrBytes, sigOffset);
      // Each sig in XDR: 4 (hint) + 4 (length=64) + 64 (sig data) = 72 bytes
      const newXdr = new Uint8Array(xdrBytes.length + 72);
      newXdr.set(xdrBytes);
      setU32(newXdr, sigOffset, currentCount + 1);
      // Append: hint (4) + length prefix (4, value=64) + sig (64)
      newXdr.set(hint4, xdrBytes.length);
      setU32(newXdr, xdrBytes.length + 4, 64); // length prefix = 64
      newXdr.set(sig64, xdrBytes.length + 8);
      return newXdr;
    }
    async function signXdr(xdrBytes, secretKey) {
      const seed = secretToSeed(secretKey);
      const pubBytes = publicKeyToBytes(
        secretKey === TREASURY_SECRET ? TREASURY_PUBLIC :
        secretKey === GBM7_SECRET     ? 'GBM7FIWAJHOADVDI7PLWNCK3T5ZHJXX6P7LCVNX6ZAMY5R3XNI7C4QGP' :
                                        'GCHQWVJ56MQNWSDAXSQEO74WIT76VCCDYLWOWATGRD7SNMCZIQOCEHML'
      );
      const hash = await computeTxHash(xdrBytes);
      const sig = await ed25519Sign(seed, hash);
      const hint = pubBytes.slice(28, 32);
      return appendSignature(xdrBytes, hint, sig);
    }
    const challengeResp = await fetch(
      `${SEP10_URL}?account=${TREASUY_PUBLIC}&client_domain=${CLIENT_DOMAIN}`
    );