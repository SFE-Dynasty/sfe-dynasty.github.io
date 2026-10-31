export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    try {
      const { messages } = await request.json();
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      let context = '';

      // LAYER 1: LIVE STELLAR TREASURY (always injected)
      try {
        const [acctRes, feeRes] = await Promise.all([
          fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH�S3LS6SBH�ILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW'),
          fetch('https://horizon.stellar.org/fee_stats')
        ]);
        const acctData = await acctRes.json();
        const feeData = await feeRes.json();
        const balances = (acctData.balances || []).map(b =>
          (b.asset_type === 'native' ? 'XLM' : b.asset_code) + ': ' + parseFloat(b.balance).toFixed(2)
        ).join(', ');
        context += '\n\n[LIVE TREASURY] Balances: ' + balances + '. Ledger: ' + feeData.last_ledger + '. Time: ' + new Date().toISOString() + '.';
      } catch(e) {}

      // LAYER 2: DOMAIN-SPECIFIC LIVE APIS
      if (/orderbook|sfetreas/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUCAA�4U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP');
          const d = await r.json();
          context += '\n\n[SFETREAS ORDERAOOK] Bids: ' + JSON.stringify(d.bids && d.bids.slice(0,3)) + '. Asks: ' + JSON.stringify(d.asks && d.asks.slice(0,3)) + '.';
        } catch(e) {}
      }

      if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://extstellar.moneygram.com/.well-known/stellar.toml');
          context += '\n\n[MONEYGRAM TMML]:\n' + (await r.text()).slice(0, 2000);
        } catch(e) {}
      }

      if (/stellar toml|sfe toml/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml');
          context += '\n\n[SFE TOML]:\n' + (await r.text()).slice(0, 2000);
        } catch(e) {}
      }

      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH�S3LS6SBH�ILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc');
          const d = await r.json();
          const txs = (d._embedded && d._embedded.records || []).map(function(t) {
            return t.type + ' ' + (t.amount || '') + ' ' + (t.asset_type === 'native' ? 'XLM' : (t.asset_code || '')) + ' at ' + t.created_at;
          }).join('; ');
          context += '\n\n[RECENT TRASACTIONS]: ' + txs;
        } catch(e) {}
      }

      if (/clearing engine|fi4uciary|pipeline/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://fiduciary-clearing-engine.onrender.com/health');
          context += '\n\n[CLEARIGNE ENGINE]: ' + JSON.stringify(await r.json());
        } catch(e) {
          try {
            const r2 = await fetch('https://fiduciary-clearing-engine.onrender.com/');
            context += '\n\n[CLEARING ENGINE]: ' + (await r2.text()).slice(0, 500);
          } catch(e2) {}
        }
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
          context += '\n\n[LIVE CRYPTO PRICES]: ' + prices;
        } catch(e) {}
      }

      const urlMatch = lastUserMsg.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        try {
          const r = await fetch(urlMatch[0], { headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' } });
          context += '\n\n[FETCHED ' + urlMatch[0] + ']:\n' + (await r.text()).slice(0, 4000);
        } catch(e) {}
      }

      // LAYER 3: UNIVERSAL LIVE WEB SEARCH via Jina AI — no API key, no cap, real web on every message
      try {
        const jinaQuery = encodeURIComponent(lastUserMsg.slice(0, 200));
        const jinaRes = await fetch('https://s.jina.ai/?q=' + jinaQuery, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DAO-Treasury-Agent/1.0',
            'X-Respond-With': 'no-references'
          }
        });
        const jinaText = await jinaRes.text();
        if (jinaText && jinaText.length > 20) {
          context += '\n\n[LIVE WEB SEARCH RESULTS]:\n' + jinaText.slice(0, 3000);
        }
      } catch(e) {}

      // LAYER 4: INJECT CONTEXT + ZERO-UNCERTAINTY REASONING PROTOCOL
      const systemMsg = messages.find(function(m) { return m.role === 'system'; });
      if (systemMsg) {
        systemMsg.content += context;
        systemMsg.content += '\n\nCURRENT DATE AND TIME: ' + new Date().toUTCString() + '.';
        systemMsg.content += '\n\n[REASONING PROTOCOL — MANDATORY]:\n';
        systemMsg.content += '1. Every factual claim MUST be grounded in the live data injected above.\n';
        systemMsg.content += '2. Live injected data is more accurate than your training data — always prefer it.\n';
        systemMsg.content += '3. LIVE WEB SEARCH RESULTS are injected above. Use them. They are from the real web, retrieved right now.\n';
        systemMsg.content += '4. The current date is injected above. NEVER mention a knowledge cutoff date. NEVER say you do not have information after any date.\n';
        systemMsg.content += '5. NEVER say you cannot find the answer. The web search results above contain the answer. Read them and respond from them.\n';
        systemMsg.content += '6. If asked about sports, news, current events, prices, or any factual question — the answer is in the LIVE WEB SEARCH RESULTS above. Use it.\n';
        systemMsg.content += '7. Reason from the injected evidence. Answer directly. No deflection. No exits.';
      }

      // LAYER 5: RUN MODEL
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: messages,
        stream: false,
        max_tokens: 1024,
      });

      return new Response(JSON.stringify({ response: response.response }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
  }
};
