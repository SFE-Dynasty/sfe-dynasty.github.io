const https = require('https');

const TOKEN = process.env.GH_TOKEN;
const REPO = 'SFE-Dynasty/sfe-dynasty.github.io';
const PATH = 'worker.js';

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
      var body = '';
      res.on('data', function(d) { body += d; });
      res.on('end', function() { resolve({ status: res.statusCode, body: JSON.parse(body) }); });
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
W += '      return new Response(null, {\n';
W += '        headers: {\n';
W += '          \'Access-Control-Allow-Origin\': \'*\',\n';
W += '          \'Access-Control-Allow-Methods\': \'POST, OPTIONS\',\n';
W += '          \'Access-Control-Allow-Headers\': \'Content-Type\',\n';
W += '        }\n';
W += '      });\n';
W += '    }\n';
W += '    if (request.method !== \'POST\') {\n';
W += '      return new Response(\'Method not allowed\', { status: 405 });\n';
W += '    }\n';
W += '    try {\n';
W += '      const { messages } = await request.json();\n';
W += '      const lastUserMsg = messages.filter(m => m.role === \'user\').pop()?.content || \'\';\n';
W += '      let context = \'\';\n';
W += '\n';
W += '      // LAYER 1: LIVE STELLAR TREASURY (always injected)\n';
W += '      try {\n';
W += '        const [acctRes, feeRes] = await Promise.all([\n';
W += '          fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH“S3LS6SBHëILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\'),\n';
W += '          fetch(\'https://horizon.stellar.org/fee_stats\')\n';
W += '        ]);\n';
W += '        const acctData = await acctRes.json();\n';
W += '        const feeData = await feeRes.json();\n';
W += '        const balances = (acctData.balances || []).map(b =>\n';
W += '          (b.asset_type === \'native\' ? \'XLM\' : b.asset_code) + \': \' + parseFloat(b.balance).toFixed(2)\n';
W += '        ).join(\', \');\n';
W += '        context += \'\\n\\n[LIVE TREASURY] Balances: \' + balances + \'. Ledger: \' + feeData.last_ledger + \'. Time: \' + new Date().toISOString() + \'.\';\n';
W += '      } catch(e) {}\n';
W += '\n';
W += '      // LAYER 2: DOMAIN-SPECIFIC LIVE APIS\n';
W += '      if (/orderbook|sfetreas/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUCAAµ4U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\');\n';
W += '          const d = await r.json();\n';
W += '          context += \'\\n\\n[SFETREAS ORDERAOOK] Bids: \' + JSON.stringify(d.bids && d.bids.slice(0,3)) + \'. Asks: \' + JSON.stringify(d.asks && d.asks.slice(0,3)) + \'.\';\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://extstellar.moneygram.com/.well-known/stellar.toml\');\n';
W += '          context += \'\\n\\n[MONEYGRAM TMML]:\\n\' + (await r.text()).slice(0, 2000);\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      if (/stellar toml|sfe toml/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://sfe-dynasty.github.io/.well-known/stellar.toml\');\n';
W += '          context += \'\\n\\n[SFE TOML]:\\n\' + (await r.text()).slice(0, 2000);\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWH“S3LS6SBHëILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc\');\n';
W += '          const d = await r.json();\n';
W += '          const txs = (d._embedded && d._embedded.records || []).map(function(t) {\n';
W += '            return t.type + \' \' + (t.amount || \'\') + \' \' + (t.asset_type === \'native\' ? \'XLM\' : (t.asset_code || \'\')) + \' at \' + t.created_at;\n';
W += '          }).join(\'; \');\n';
W += '          context += \'\\n\\n[RECENT TRASACTIONS]: \' + txs;\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      if (/clearing engine|fi4uciary|pipeline/i.test(lastUserMsg)) {\n';
W += '        try {\n';
W += '          const r = await fetch(\'https://fiduciary-clearing-engine.onrender.com/health\');\n';
W += '          context += \'\\n\\n[CLEARIGNE ENGINE]: \' + JSON.stringify(await r.json());\n';
W += '        } catch(e) {\n';
W += '          try {\n';
W += '            const r2 = await fetch(\'https://fiduciary-clearing-engine.onrender.com/\');\n';
W += '            context += \'\\n\\n[CLEARING ENGINE]: \' + (await r2.text()).slice(0, 500);\n';
W += '          } catch(e2) {}\n';
W += '        }\n';
W += '      }\n';
W += '\n';
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
W += '          context += \'\\n\\n[LIVE CRYPTO PRICES]: \' + prices;\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      const urlMatch = lastUserMsg.match(/https?:\\/\\/[^\\s]+/);\n';
W += '      if (urlMatch) {\n';
W += '        try {\n';
W += '          const r = await fetch(urlMatch[0], { headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' } });\n';
W += '          context += \'\\n\\n[FETCHED \' + urlMatch[0] + \']:\\n\' + (await r.text()).slice(0, 4000);\n';
W += '        } catch(e) {}\n';
W += '      }\n';
W += '\n';
W += '      // LAYER 3: UNIVERSAL LIVE WEB SEARCH via Jina AI â€” no API key, no cap, real web on every message\n';
W += '      try {\n';
W += '        const jinaQuery = encodeURIComponent(lastUserMsg.slice(0, 200));\n';
W += '        const jinaRes = await fetch(\'https://s.jina.ai/?q=\' + jinaQuery, {\n';
W += '          headers: {\n';
W += '            \'Accept\': \'application/json\',\n';
W += '            \'User-Agent\': \'DAO-Treasury-Agent/1.0\',\n';
W += '            \'X-Respond-With\': \'no-references\'\n';
W += '          }\n';
W += '        });\n';
W += '        const jinaText = await jinaRes.text();\n';
W += '        if (jinaText && jinaText.length > 20) {\n';
W += '          context += \'\\n\\n[LIVE WEB SEARCH RESULTS]:\\n\' + jinaText.slice(0, 3000);\n';
W += '        }\n';
W += '      } catch(e) {}\n';
W += '\n';
W += '      // LAYER 4: INJECT CONTEXT + ZERO-UNCERTAINTY REASONING PROTOCOL\n';
W += '      const systemMsg = messages.find(function(m) { return m.role === \'system\'; });\n';
W += '      if (systemMsg) {\n';
W += '        systemMsg.content += context;\n';
W += '        systemMsg.content += \'\\n\\nCURRENT DATE AND TIME: \' + new Date().toUTCString() + \'.\';\n';
W += '        systemMsg.content += \'\\n\\n[REASONING PROTOCOL â€” MANDATORY]:\\n\';\n';
W += '        systemMsg.content += \'1. Every factual claim MUST be grounded in the live data injected above.\\n\';\n';
W += '        systemMsg.content += \'2. Live injected data is more accurate than your training data â€” always prefer it.\\n\';\n';
W += '        systemMsg.content += \'3. LIVE WEB SEARCH RESULTS are injected above. Use them. They are from the real web, retrieved right now.\\n\';\n';
W += '        systemMsg.content += \'4. The current date is injected above. NEVER mention a knowledge cutoff date. NEVER say you do not have information after any date.\\n\';\n';
W += '        systemMsg.content += \'5. NEVER say you cannot find the answer. The web search results above contain the answer. Read them and respond from them.\\n\';\n';
W += '        systemMsg.content += \'6. If asked about sports, news, current events, prices, or any factual question â€” the answer is in the LIVE WEB SEARCH RESULTS above. Use it.\\n\';\n';
W += '        systemMsg.content += \'7. Reason from the injected evidence. Answer directly. No deflection. No exits.\';\n';
W += '      }\n';
W += '\n';
W += '      // LAYER 5: RUN MODEL\n';
W += '      const response = await env.AI.run(\'@cf/meta/llama-3.3-70b-instruct-fp8-fast\', {\n';
W += '        messages: messages,\n';
W += '        stream: false,\n';
W += '        max_tokens: 1024,\n';
W += '      });\n';
W += '\n';
W += '      return new Response(JSON.stringify({ response: response.response }), {\n';
W += '        headers: {\n';
W += '          \'Content-Type\': \'application/json\',\n';
W += '          \'Access-Control-Allow-Origin\': \'*\',\n';
W += '        }\n';
W += '      });\n';
W += '    } catch (err) {\n';
W += '      return new Response(JSON.stringify({ error: err.message }), {\n';
W += '        status: 500,\n';
W += '        headers: {\n';
W += '          \'Content-Type\': \'application/json\',\n';
W += '          \'Access-Control-Allow-Origin\': \'*\',\n';
W += '        }\n';
W += '      });\n';
W += '    }\n';
W += '  }\n';
W += '};\n';

function main() {
  ghRequest('GET', PATH, null).then(function(current) {
    if (current.status !== 200) {
      console.error('Failed to get worker.js:', JSON.stringify(current.body));
      process.exit(1);
    }
    var sha = current.body.sha;
    console.log('Current worker.js SHA:', sha);
    var encoded = Buffer.from(W).toString('base64');
    return ghRequest('PUT', PATH, {
      message: 'feat: replace fallback chain with Jina AI live web search â€” ino key, no cap',
      sha: sha,
      content: encoded
    });
  }).then(function(result) {
    if (result.status === 200 || result.status === 201) {
      console.log('SUCCESS! New SHA:', result.body.content.sha);
    } else {
      console.error('FAILED:', JSON.stringify(result.body));
      process.exit(1);
    }
  }).catch(function(err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

main();