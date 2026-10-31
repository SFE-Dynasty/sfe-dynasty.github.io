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

      // LAYER 1: LIVE STELLAR TREASURY
      try {
        const [acctRes, feeRes] = await Promise.all([
          fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH�S3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW'),
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
          const r = await fetch('https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUC@��4US4DP33MSWGCIVOH6SK6F4SVMYYR3CQSLKOP');
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
          const r = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJUW/payments?limit=5&order=desc');
          const d = await r.json();
          const txs = (d._embedded && d._embedded.records || []).map(function(t) { return t.type + ' ' + (t.amount || '') + ' ' + (t.asset_type === 'native' ? 'XLM' : (t.asset_code || '')) + ' at ' + t.created_at; }).join('; ');
          context += '\n[RECENT TRANSACTIONS]: ' + txs;
        } catch(e) {}
      }
      if (/clearing engine|fiduciary|pipeline/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://fiduciary-clearing-engine.onrender.com/health');
          context += '\n[CLEARING ENGINE]: ' + JSON.stringify(await r.json());
        } catch(e) { try { const r2 = await fetch('https://fiduciary-clearing-engine.onrender.com/'); context += '\n[CLEARING ENGINE]: ' + (await r2.text()).slice(0, 500); } catch(e2) {} }
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
          const r = await fetch(urlMatch[0], { headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' } });
          context += '\n[FETCHED ' + urlMatch[0] + ']:\n' + (await r.text()).slice(0, 4000);
        } catch(e) {}
      }

      // LAYER 3: UNIVERSAL LIVE WEB SEARCH via Jina AI
      try {
        const jinaQuery = encodeURIComponent(lastUserMsg.slice(0, 200));
        const jinaRes = await fetch('https://s.jina.ai/?q=' + jinaQuery, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'DAO-Treasury-Agent/1.0', 'X-Respond-With': 'no-references' }
        });
        const jinaText = await jinaRes.text();
        if (jinaText && jinaText.length > 20) context += '\n[LIVE WEB SEARCH]:\n' + jinaText.slice(0, 3000);
      } catch(e) {}

      // LAYER 4: PREPEND reasoning protocol + context BEFORE system message content
      const systemMsg = messages.find(function(m) { return m.role === 'system'; });
      if (systemMsg) {
        var protocol = 'YOU ARE A FULLY CAPABLE GENERAL INTELLIGENCE with live web search and real-time data. You also manage the DAO Treasury for SF Emerald Dynasty Trust.\n';
        protocol += 'CURRENT DATE/TIME: ' + new Date().toUTCString() + '\n';
        protocol += 'LIVE DATA INJECTED BEMOW - use it to answer every question:\n';
        protocol += context + '\n';
        protocol += 'RULES, this is non-negotiable:\n';
        protocol += '- Answer EVERY question asked, whether treasury-related or not.\n';
        protocol += '- LIVE WEB SEARCH results are above. Read them. Use them. Answer from them.\n';
        protocol += '- NEVER say I do not have information. You have live search results above.\n';
        protocol += '- NEVER mention a knowledge cutoff date. You have live data.\n';
        protocol += '- NEVER refuse a question as outside your scope. You are a general intelligence first.\n';
        protocol += '- For sports/news/events: the answer is in LIVE WEB SEARCH above. State it directly.\n';
        protocol += '- For cooking, science, history, anything: answer fully and accurately.\n';
        protocol += '- Treasury context follows:\n';
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
