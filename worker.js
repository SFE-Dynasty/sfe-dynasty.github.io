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

      // DEPOSIT INIT COMMAND
      if (lastUserMsg === '__DEPOSIT_INIT__') {
        try {
          const StellarSdk = await import('https://cdn.jsdelivr.net/npm/stellar-sdk@12.3.0/+esm');
          const TREASURY_SECRET = 'SDUDKTIKVX6NQVG7XCCUFIDI62QPO2QWMRN35LHFWYHU33IZFEAA4A55';
          const GBM7_SECRET = 'SCAZ7NWRI2EOOBD7Z2BFYP7YNO7TPRAIIQJHY7B3ZDZPFCCE6QN7CTGK';
          const GCHQ_SECRET = 'SBTXFQABN3XNCJJFZGOQRQO3P4USQTG2INX2UVOHWUCKRZRNRWU7FZR7';
          const TREASURY_PUBLIC = 'GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW';
          const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
          const SEP10_AUTH = 'https://mgxanchor.moneygram.com/stellarsepservice/auth';
          const SEP24_DEPOSIT = 'https://mgxanchor.moneygram.com/stellarsepservice/sep24/transactions/deposit/interactive';
          const CLIENT_DOMAIN = 'sfe-dynasty.github.io';
          const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

          // Step 1: Fetch SEP-10 challenge
          const challengeRes = await fetch(`${SEP10_AUTH}?account=${TREASURY_PUBLIC}&client_domain=${CLIENT_DOMAIN}`);
          if (!challengeRes.ok) {
            const errText = await challengeRes.text();
            return new Response(JSON.stringify({ error: 'SEP-10 challenge fetch failed: ' + errText }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          const challengeData = await challengeRes.json();
          const challengeXdr = challengeData.transaction;
          if (!challengeXdr) {
            return new Response(JSON.stringify({ error: 'No transaction in SEP-10 challenge response' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }

          // Step 2: Sign with all 3 keys
          const network = new StellarSdk.Networks.PUBLIC;
          const tx = StellarSdk.TransactionBuilder.fromXDR(challengeXdr, NETWORK_PASSPHRASE);
          const treasuryKP = StellarSdk.Keypair.fromSecret(TREASURY_SECRET);
          const gbm7KP = StellarSdk.Keypair.fromSecret(GBM7_SECRET);
          const gchqKP = StellarSdk.Keypair.fromSecret(GCHQ_SECRET);
          tx.sign(treasuryKP);
          tx.sign(gbm7KP);
          tx.sign(gchqKP);
          const signedXdr = tx.toXDR();

          // Step 3: POST signed XDR to get JWT
          const tokenRes = await fetch(SEP10_AUTH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: signedXdr })
          });
          if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            return new Response(JSON.stringify({ error: 'SEP-10 token exchange failed: ' + errText }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          const tokenData = await tokenRes.json();
          const jwt = tokenData.token;
          if (!jwt) {
            return new Response(JSON.stringify({ error: 'No JWT in SEP-10 token response' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }

          // Step 4: POST to SEP-24 deposit endpoint
          const depositBody = new URLSearchParams();
          depositBody.append('asset_code', 'USDC');
          depositBody.append('asset_issuer', USDC_ISSUER);
          depositBody.append('account', TREASURY_PUBLIC);
          const depositRes = await fetch(SEP24_DEPOSIT, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + jwt,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: depositBody.toString()
          });
          if (!depositRes.ok) {
            const errText = await depositRes.text();
            return new Response(JSON.stringify({ error: 'SEP-24 deposit initiation failed: ' + errText }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          const depositData = await depositRes.json();
          return new Response(JSON.stringify({
            deposit_url: depositData.url,
            transaction_id: depositData.id,
            response: 'SEP-24 deposit session initiated successfully.'
          }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        } catch (depositErr) {
          return new Response(JSON.stringify({ error: 'Deposit init error: ' + depositErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
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
