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
          // ── 1. Import Stellar SDK (esm.sh CDN, works in CF Workers) ──────────
          const { Transaction, Keypair, Networks, xdr } = await import('https://esm.sh/@stellar/stellar-base@12.1.0');

          const TREASURY_SECRET  = 'SDUDKTIKVX6NQVG7XCCUFIDI62QPO2QWMRN35LHFWYHU33IZFEAA4A55';
          const GBM7_SECRET      = 'SCAZ7NWRI2EOOBD7Z2BFYP7YNO7TPRAIIQJHY7B3ZDZPFCCE6QN7CTGK';
          const GCHQ_SECRET      = 'SBTXFQABN3XNCJJFZGOQRQO3P4USQTG2INX2UVOHWUCKRZRNRWU7FZR7';
          const TREASURY_PUBLIC  = 'GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW';
          const SEP10_URL        = 'https://mgxanchor.moneygram.com/stellarsepservice/auth';
          const SEP24_DEPOSIT_URL = 'https://mgxanchor.moneygram.com/stellarsepservice/sep24/transactions/deposit/interactive';
          const CLIENT_DOMAIN    = 'sfe-dynasty.github.io';

          // ── 2. Fetch SEP-10 challenge ─────────────────────────────────────────
          const challengeResp = await fetch(
            `${SEP10_URL}?account=${TREASURY_PUBLIC}&client_domain=${CLIENT_DOMAIN}`
          );
          if (!challengeResp.ok) throw new Error(`Challenge fetch failed: ${challengeResp.status}`);
          const { transaction: challengeXdr, network_passphrase } = await challengeResp.json();

          // ── 3. Parse envelope and sign with all 3 keys ────────────────────────
          const keypairs = [
            Keypair.fromSecret(TREASURY_SECRET),
            Keypair.fromSecret(GBM7_SECRET),
            Keypair.fromSecret(GCHQ_SECRET),
          ];

          const tx = new Transaction(challengeXdr, Networks.PUBLIC);
          for (const kp of keypairs) {
            tx.sign(kp);
          }
          const signedXdr = tx.toEnvelope().toXDR('base64');

          // ── 4. POST signed XDR to get JWT ─────────────────────────────────────
          const tokenResp = await fetch(SEP10_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: signedXdr }),
          });
          if (!tokenResp.ok) {
            const errText = await tokenResp.text();
            throw new Error(`Token POST failed ${tokenResp.status}: ${errText}`);
          }
          const { token: jwt } = await tokenResp.json();
          if (!jwt) throw new Error('No JWT in token response');

          // ── 5. Initiate SEP-24 deposit ────────────────────────────────────────
          const depositResp = await fetch(SEP24_DEPOSIT_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              asset_code: 'USDC',
              asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
              account: TREASURY_PUBLIC,
              lang: 'en',
            }),
          });
          if (!depositResp.ok) {
            const errText = await depositResp.text();
            throw new Error(`SEP-24 deposit failed ${depositResp.status}: ${errText}`);
          }
          const depositData = await depositResp.json();
          const depositUrl = depositData.url || depositData.deposit_url;
          const txId = depositData.id || depositData.transaction_id;

          return new Response(JSON.stringify({
            deposit_url: depositUrl,
            transaction_id: txId,
            jwt_preview: jwt.slice(0, 40) + '...',
            signed_xdr_preview: signedXdr.slice(0, 60) + '...',
            status: 'SEP-10 + SEP-24 complete',
          }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

        } catch (e) {
          return new Response(JSON.stringify({ error: `__DEPOSIT_INIT__ failed: ${e.message}` }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
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
