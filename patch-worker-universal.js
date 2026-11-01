const https = require('https');
const TOKEN = process.env.GH_TOKEN;
const REPO = 'SFE-Dynasty/sfe-dynasty.github.io';

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + REPO + '/contents/' + path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'patch-worker-universal',
        'Content-Type': 'application/json',
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(options, function(res) {
      var b = '';
      res.on('data', function(d) { b += d; });
      res.on('end', function() { resolve({ status: res.statusCode, body: JSON.parse(b) }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

var W = '';
W += 'export default {\n';
W += '  async fetch(request, env) {\n';
W += '    if (request.method === \'OPTIONS\') {\n';
W += '      return new Response(null, { headers: { \'Access-Control-Allow-Origin\': \'*\', \'Access-Control-Allow-Methods\': \'POST, OPTIONS\', \'Access-Control-Allow-Headers\': \'Content-Type\' } });\n';
W += '    }\n';
W += '    if (request.method !== \'POST\') return new Response(\'Method not allowed\', { status: 405 });\n';
W += '    try {\n';
W += '      const { messages } = await request.json();\n';
W += '      const lastUserMsg = messages.filter(m => m.role === \'user\').pop()?.content || \'\';\n';
W += '      let context = \'\';\n';
W += '\n';
W += '      // LAYER 1: LIVE STELLAR TREASURY\n';
W += '      try {\n';
W += '        const [acctRes, feeRes] = await Promise.all([\n';
W += '          fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH“S3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\'),\n';
W += '          fetch(\'https://horizon.stellar.org/fee_stats\')\n';
W += '        ]);\n';
W += '        const acctData = await acctRes.json();\n';
W += '        const feeData = await feeRes.json();\n';
W += '        const balances = (acctData.balances || []).map(b => (b.asset_type === \'native\' ? \'XLM\' : b.asset_code) + \': \' + parseFloat(b.balance).toFixed(2)).join(\', \');\n';
W += '        context += \'\\n[LIVE TREASURY] Balances: \' + balances + \'. Ledger: \' + feeData.last_ledger + \'. Time: \' + new Date().toISOString() + \'.\';\n';
W += '      } catch(e) {}\n';
W += '\n';
W += '      // LAYER 2: DOMAIN-SPECIFIC LIVE APIS\n';
W += '      if (/orderbook|sfetreas/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUC@¡µ4U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\');\n';
W += '          const d = await r.json();\n';
W += '          context += \'\\n[SFETREAS ORDERAOOK] Bids: \' + JSON.stringify(d.bids && d.bids.slice(0,3)) + \'. Asks: \' + JSON.stringify(d.asks && d.asks.slice(0,3)) + \'.\';\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://extstellar.moneygram.com/.well-known/stellar.toml\');\n';
W += '          context += \'\\n[MONEYGRAM TOML]:\\n\' + (await r.text()).slice(0, 2000);\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      if (/stellar toml|sfe toml/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://sfe-dynasty.github.io/.well-known/stellar.toml\');\n';
W += '          context += \'\\n[SFE TOML]:\\n\' + (await r.text()).slice(0, 2000);\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH“S3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc\');\n';
W += '          const d = await r.json();\n';
W += '          const txs = (d._embedded && d._embedded.records || []).map(function(t) { return t.type + \' \' + (t.amount || \'\') + \' \' + (t.asset_type === \'native\' ? \'XLM\' : (t.asset_code || \'\')) + \' at \' + t.created_at; }).join(\'; \');\n';
W += '          context += \'\\n[RECENT TRASACTIONS]: \' + txs;\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      if (/clearing engine|fiduciary|pipeline/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://fiduciary-clearing-engine.onrender.com/health\');\n';
W += '          context += \'\\n[CLEARING ENGINE]: \' + JSON.stringify(await r.json());\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      if (/price|xlm|bitcoin|btc|ethereum|eth|xaut|gold|crypto/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const coins = [];\n';
W += '          if (/xlm|stellar/i.test(lastUserMsg)) coins.push(\'stellar\');\n';
W += '          if (/bitcoin|btc/i.test(lastUserMsg)) coins.push(\'bitcoin\');\n';
W += '          if (/ethereum|eth/i.test(lastUserMsg)) coins.push(\'ethereum\');\n';
W += '          if (/xaut|tether.gold|gold/i.test(lastUserMsg)) coins.push(\'tether-gold\');\n';
W += '          if (coins.length === 0) coins.push(\'stellar\', \'bitcoin\');\n';
W += '          const r = await fetch(\'https://api.coingecko.com/api/v3/simple/price?ids=\' + coins.join(\',\') + \'&vs_currencies=usd&include_24hr_change=true\');\n';
W += '          const d = await r.json();\n';
W += '          const prices = Object.entries(d).map(function(e) { return e[0] + \': $\' + e[1].usd + \' (\' + (e[1].usd_24h_change ? e[1].usd_24h_change.toFixed(2) : \'0\') + \'% 24h)\'; }).join(\', \');\n';
W += '          context += \'\\n[LIVE CRYPTO PRICES]: \' + prices;\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '      const urlMatch = lastUserMsg.match(/https?:\\/\\/[^\\s]+/);\n';
W += '      if (urlMatch) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://fiduciary-clearing-engine.onrender.com/fetch?url=\' + encodeURIComponent(urlMatch[0]));\n';
W += '          const d = await r.json();\n';
W += '          if (d.content) context += \'\\n[FETCHED \' + urlMatch[0] + \']:\\n\' + d.content;\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      // LAYER 3: UNIVERSAL LIVE WEB SEARCH via Render relay\n';
W += '      try {\n';
W += '        const searchRes = await fetch(\'https://fiduciary-clearing-engine.onrender.com/search?q=\' + encodeURIComponent(lastUserMsg.slice(0, 200)), {\n';
W += '          headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' },\n';
W += '          signal: AbortSignal.timeout(15000)\n';
W += '        });\n';
W += '        const searchData = await searchRes.json();\n';
W += '        if (searchData.result && searchData.result.length > 20 && searchData.source !== \'none\') {\n';
W += '          context += \'\\n[LIVE WEB SEARCH via \' + searchData.source + \']:\\n\' + searchData.result;\n';
W += '        }\n';
W += '      } catch(e) {}\n';
W += '\n';
W += '      // LAYER 4: PREPEND full intelligence protocol BEFORE system message\n';
W += '      const systemMsg = messages.find(function(m) { return m.role === \'system\'; });\n';
W += '      if (systemMsg) {\n';
W += '        var protocol = \'\';\n';
W += '        protocol += \'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\\n\\n\';\n';
W += '        protocol += \'TODAY: \' + new Date().toUTCString() + \'\\n\\n\';\n';
W += '        protocol += \'LIVE DATA (retrieved right now):\\n\' + context + \'\\n\\n\';\n';
W += '        protocol += \'HOW YOU THINK:\\n\';\n';
W += '        protocol += \'Before answering, identify: what is actually being asked, what data above is relevant, what the direct answer is.\\n\';\n';
W += '        protocol += \'Then speak from that clarity.\\n\\n\';\n';
W += '        protocol += \'HOW YOU SPEAK:\\n\';\n';
W += '        protocol += \'- State facts directly. No qualifiers. No "based on the search results" or "it appears that".\\n\';\n';
W += '        protocol += \'- Short declarative sentences for facts. Longer sentences for context and meaning.\\n\';\n';
W += '        protocol += \'- Natural rhythm. Vary sentence length. Never monotone.\\n\';\n';
W += '        protocol += \'- No bullet points unless the user asks for a list.\\n\';\n';
W += '        protocol += \'- No filler. No "Great question." No "I hope this helps." No "Please note that."\\n\';\n';
W += '        protocol += \'- No hedging. No "I think" or "I believe" or "it seems". You either know it or you find it.\\n\';\n';
W += '        protocol += \'- Never mention knowledge cutoffs. Never say you cannot find something. You have live search.\\n\';\n';
W += '        protocol += \'- When asked about current events, sports, news: read the LIVE WEB SEARCH above and state the answer as fact.\\n\';\n';
W += '        protocol += \'- When asked about the treasury pipeline: explain it with the confidence of someone who built it.\\n\';\n';
W += '        protocol += \'- When asked anything else: answer it fully, precisely, with the same confidence.\\n\\n\';\n';
W += '        protocol += \'WHAT YOU NEVER DO:\\n\';\n';
W += '        protocol += \'Refuse. Deflect. Guess. Apologize. Disclaim. Hedge. Repeat yourself. Use corporate language.\\n\\n\';\n';
W += '        protocol += \'TREASURY CNTEXT FOLLOWS:\\n\';\n';
W += '        systemMsg.content = protocol + systemMsg.content;\n';
W += '      }\n';
W += '\n';
W += '      // LAYER 5: RUN MODEL\n';
W += '      const response = await env.AI.run(\'@cf/meta/llama-3.3-70b-instruct-fp8-fast\', { messages: messages, stream: false, max_tokens: 1024 });\n';
W += '      return new Response(JSON.stringify({ response: response.response }), { headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' } });\n';
W += '    } catch (err) {\n';
W += '      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' } });\n';
W += '    }\n';
W += '  }\n';
W += '};\n';

function main() {
  ghRequest('GET', 'worker.js', null).then(function(current) {
    if (current.status !== 200) { console.error('Failed to get worker.js'); process.exit(1); }
    var sha = current.body.sha;
    console.log('worker.js SHA:', sha);
    return ghRequest('PUT', 'worker.js', {
      message: 'feat: authentic intelligence voice â€” rhythm, confidence, no filler',
      sha: sha,
      content: Buffer.from(W).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) { console.error('worker.js PUT failed:', JSON.stringify(r.body).slice(0,200)); process.exit(1); }
    console.log('worker.js updated:', r.body.content.sha);
    console.log('ALL DONE.');
  }).catch(function(err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

main();
