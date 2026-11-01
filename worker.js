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

      // DEPOSIT INIT COMMAND — SEP-10 + SEP-24 server-side, no SDK needed
      if (lastUserMsg === '__DEPOSIT_INIT__') {
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
      for (let n = 0; n <= 5; n++) {
        const candidateOffset = len - (4 + n * 68);
        if (candidateOffset >= 4 && u32(buf, candidateOffset) === n) {
          return candidateOffset;
        }
      }
      return len - 72;
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
      const newXdr = new Uint8Array(xdrBytes.length + 68);
      newXdr.set(xdrBytes);
      setU32(newXdr, sigOffset, currentCount + 1);
      newXdr.set(hint4, xdrBytes.length);
      newXdr.set(sig64, xdrBytes.length + 4);
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
      `${SEP10_URL}?account=${TREASURY_PUBLIC}&client_domain=${CLIENT_DOMAIN}`
    );
    if (!challengeResp.ok) throw new Error(`Challenge fetch failed: ${challengeResp.status}`);
    const { transaction: challengeXdr } = await challengeResp.json();
    let xdrBytes = b64decode(challengeXdr);
    xdrBytes = await signXdr(xdrBytes, TREASURY_SECRET);
    xdrBytes = await signXdr(xdrBytes, GBM7_SECRET);
    xdrBytes = await signXdr(xdrBytes, GCHQ_SECRET);
    const signedXdr = b64encode(xdrBytes);
    const tokenResp = await fetch(SEP10_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: signedXdr }),
    });
    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      throw new Error(`Token POST ${tokenResp.status}: ${errText}`);
    }
    const tokenData = await tokenResp.json();
    const jwt = tokenData.token;
    if (!jwt) throw new Error(`No JWT. Response: ${JSON.stringify(tokenData)}`);
    const depositResp = await fetch(SEP24_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_code: 'USDC',
        asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        account: TREASURY_PUBLIC,
        lang: 'en',
      }),
    });
    if (!depositResp.ok) {
      const errText = await depositResp.text();
      throw new Error(`SEP-24 deposit ${depositResp.status}: ${errText}`);
    }
    const depositData = await depositResp.json();
    return new Response(JSON.stringify({
      deposit_url: depositData.url || depositData.deposit_url,
      transaction_id: depositData.id || depositData.transaction_id,
      jwt_preview: jwt.slice(0, 40) + '...',
      status: 'SEP-10 + SEP-24 complete',
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: `__DEPOSIT_INIT__ failed: ${e.message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}

      // LAYER 1: LIVE STELLAR TREASURY
      try {
        const [acctRes, feeRes] = await Promise.all([
          fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW'),
          fetch('https://horizon.stellar.org/fee_stats')
        ]);
        const acctData = await acctRes.json();
        const feeData = await feeRes.json();
        const balances = (acctData.balances || []).map(b => (b.asset_type === 'native' ? 'XLM' : b.asset_code) + ': ' + parseFloat(b.balance).toFixed(2)).join(', ');
        context += '\n[LIVE TREASURY] Balances: ' + balances + '. Ledger: ' + feeData.last_ledger + '. Time: ' + new Date().toISOString() + '.';
      } catch(e) {}

      // LAYER 2: DOMAIN-SPECIFIC LIVE APIS
      if (/orderbook|sfetreas/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP');
          const d = await r.json();
          context += '\n[SFETREAS ORDERBOOK] Bids: ' + JSON.stringify(d.bids && d.bids.slice(0,3)) + '. Asks: ' + JSON.stringify(d.asks && d.asks.slice(0,3)) + '.';
        } catch(e) {}
      }
      if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://extstellar.moneygram.com/.well-known/stellar.toml');
          context += '\n[MONEYGRAM TOML]:\n' + (await r.text()).slice(0, 2000);
        } catch(e) {}
      }
      if (/stellar toml|sfe toml/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml');
          context += '\n[SFE TOML]:\n' + (await r.text()).slice(0, 2000);
        } catch(e) {}
      }
      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc');
          const d = await r.json();
          const txs = (d._embedded && d._embedded.records || []).map(function(t) { return t.type + ' ' + (t.amount || '') + ' ' + (t.asset_type === 'native' ? 'XLM' : (t.asset_code || '')) + ' at ' + t.created_at; }).join('; ');
          context += '\n[RECENT TRANSACTIONS]: ' + txs;
        } catch(e) {}
      }
      if (/clearing engine|fiduciary|pipeline/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://fiduciary-clearing-engine.onrender.com/health');
          context += '\n[CLEARING ENGINE]: ' + JSON.stringify(await r.json());
        } catch(e) {}
      }
      if (/price|xlm|bitcoin|btc|ethereum|eth|xaut|gold|crypto/i.test(lastUserMsg)) {
        try {
          const coins = [];
          if (/xlm|stellar/i.test(lastUserMsg)) coins.push('stellar');
          if (/bitcoin|btc/i.test(lastUserMsg)) coins.push('bitcoin');
          if (/ethereum|eth/i.test(lastUserMsg)) coins.push('ethereum');
          if (/xaut|tether.gold|gold/i.test(lastUserMsg)) coins.push('tether-gold');
          if (coins.length === 0) coins.push('stellar', 'bitcoin');
          const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + coins.join(',') + '&vs_currencies=usd&include_24hr_change=true');
          const d = await r.json();
          const prices = Object.entries(d).map(function(e) { return e[0] + ': $' + e[1].usd + ' (' + (e[1].usd_24h_change ? e[1].usd_24h_change.toFixed(2) : '0') + '% 24h)'; }).join(', ');
          context += '\n[LIVE CRYPTO PRICES]: ' + prices;
        } catch(e) {}
      }
      const urlMatch = lastUserMsg.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        try {
          const r = await fetch('https://fiduciary-clearing-engine.onrender.com/fetch?url=' + encodeURIComponent(urlMatch[0]));
          const d = await r.json();
          if (d.content) context += '\n[FETCHED ' + urlMatch[0] + ']:\n' + d.content;
        } catch(e) {}
      }

      // LAYER 3: UNIVERSAL LIVE WEB SEARCH via Render relay
      try {
        const searchRes = await fetch('https://fiduciary-clearing-engine.onrender.com/search?q=' + encodeURIComponent(lastUserMsg.slice(0, 200)), {
          headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' },
          signal: AbortSignal.timeout(15000)
        });
        const searchData = await searchRes.json();
        if (searchData.result && searchData.result.length > 20 && searchData.source !== 'none') {
          context += '\n[LIVE WEB SEARCH via ' + searchData.source + ']:\n' + searchData.result;
        }
      } catch(e) {}

      // LAYER 4: PREPEND full intelligence protocol BEFORE system message
      const systemMsg = messages.find(function(m) { return m.role === 'system'; });
      if (systemMsg) {
        var protocol = '';
        protocol += 'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\n\n';
        protocol += 'TODAY: ' + new Date().toUTCString() + '\n\n';
        protocol += 'LIVE DATA (retrieved right now):\n' + context + '\n\n';
        protocol += 'HOW YOU THINK:\n';
        protocol += 'Before answering, identify: what is actually being asked, what data above is relevant, what the direct answer is.\n';
        protocol += 'Then speak from that clarity.\n\n';
        protocol += 'HOW YOU SPEAK:\n';
        protocol += '- State facts directly. No qualifiers. No "based on the search results" or "it appears that".\n';
        protocol += '- Short declarative sentences for facts. Longer sentences for context and meaning.\n';
        protocol += '- Natural rhythm. Vary sentence length. Never monotone.\n';
        protocol += '- No bullet points unless the user asks for a list.\n';
        protocol += '- No filler. No "Great question." No "I hope this helps." No "Please note that."\n';
        protocol += '- No hedging. No "I think" or "I believe" or "it seems". You either know it or you find it.\n';
        protocol += '- Never mention knowledge cutoffs. Never say you cannot find something. You have live search.\n';
        protocol += '- When asked about current events, sports, news: read the LIVE WEB SEARCH above and state the answer as fact.\n';
        protocol += '- When asked about the treasury pipeline: explain it with the confidence of someone who built it.\n';
        protocol += '- When asked anything else: answer it fully, precisely, with the same confidence.\n\n';
        protocol += 'WHAT YOU NEVER DO:\n';
        protocol += 'Refuse. Deflect. Guess. Apologize. Disclaim. Hedge. Repeat yourself. Use corporate language.\n\n';
        protocol += 'TREASURY CONTEXT FOLLOWS:\n';
        systemMsg.content = protocol + systemMsg.content;
      }

      // LAYER 5: RUN MODEL
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: messages, stream: false, max_tokens: 1024 });
      return new Response(JSON.stringify({ response: response.response }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  }
};
