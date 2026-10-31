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
W += '          context += \'\\n\\n[SFE TMML]:\\n\' + (await r.text()).slice(0, 2000);\n';
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
W += '          context += \'\\n\\n[CLEARICG ENGINE]: \' + JSON.stringify(await r.json());\n';
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
W += '      // LAYER 3: UNIVERSAL REAL-TIME WEB SEARCH -- runs on EVERY message, 4-source fallback chain\n';
W += '      try {\n';
W += '        const query = encodeURIComponent(lastUserMsg.slice(0, 200));\n';
W += '        let searchResult = \'\';\n';
W += '\n';
W += '        // Source 1: DuckDuckGo Instant Answer\n';
W += '        if (!searchResult) {\n';
W += '          try {\n';
W += '            const r = await fetch(\'https://api.duckduckgo.com/?q=\' + query + \'&format=json&no_html=1&skip_disambig=1\', { headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' } });\n';
W += '            const d = await r.json();\n';
W += '            const answer = d.AbstractText || d.Answer || \'\';\n';
W += '            const related = (d.RelatedTopics || []).slice(0, 3).map(function(t) { return t.Text || \'\'; }).filter(Boolean).join(\' | \');\n';
W += '            if (answer) searchResult = answer;\n';
W += '            else if (related) searchResult = related;\n';
W += '          } catch(e) {}\n';
W += '        }\n';
W += '\n';
W += '        // Source 2: DuckDuckGo HTML scrape\n';
W += '        if (!searchResult) {\n';
W += '          try {\n';
W += '            const r = await fetch(\'https://html.duckduckgo.com/html/?q=\' + query, { headers: { \'User-Agent\': \'Mozilla/5.0 (compatible; DAO-Treasury-Agent/1.0)\' } });\n';
W += '            const html = await r.text();\n';
W += '            const m = html.match(/class="result__snippet"[^>]*>([^<]{20,400})</);\n';
W += '            if (m) searchResult = m[1].trim();\n';
W += '          } catch(e) {}\n';
W += '        }\n';
W += '\n';
W += '        // Source 3: Wikipedia direct page summary\n';
W += '        if (!searchResult) {\n';
W += '          try {\n';
W += '            const wq = encodeURIComponent(lastUserMsg.replace(/[?!]/g, \'\').slice(0, 100));\n';
W += '            const r = await fetch(\'https://en.wikipedia.org/api/rest_v1/page/summary/\' + wq, { headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' } });\n';
W += '            const d = await r.json();\n';
W += '            if (d.extract) searchResult = d.extract.slice(0, 600);\n';
W += '          } catch(e) {}\n';
W += '        }\n';
W += '\n';
W += '        // Source 4: Wikipedia search + article fetch\n';
W += '        if (!searchResult) {\n';
W += '          try {\n';
W += '            const r = await fetch(\'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\' + query + \'&format=json&srlimit=1\', { headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' } });\n';
W += '            const d = await r.json();\n';
W += '            const snippet = d.query && d.query.search && d.query.search[0] ? d.query.search[0].snippet.replace(/<[^>]+>/g, \'\') : \'\';\n';
W += '            const title = d.query && d.query.search && d.query.search[0] ? d.query.search[0].title : \'\';\n';
W += '            if (snippet) {\n';
W += '              try {\n';
W += '                const r2 = await fetch(\'https://en.wikipedia.org/api/rest_v1/page/summary/\' + encodeURIComponent(title), { headers: { \'User-Agent\': \'DAO-Treasury-Agent/1.0\' } });\n';
W += '                const d2 = await r2.json();\n';
W += '                searchResult = d2.extract ? d2.extract.slice(0, 600) : snippet;\n';
W += '              } catch(e) { searchResult = snippet; }\n';
W += '            }\n';
W += '          } catch(e) {}\n';
W += '        }\n';
W += '\n';
W += '        if (searchResult) context += \'\\n\\n[REAL-TIME WEB SEARCH]: \' + searchResult;\n';
W += '      } catch(e) {}\n';
W += '\n';
W += '      // LAYER 4: INJECT CONTEXT + ZERO-UNCERTAINTY REASONING PROTOCOL\n';
W += '      const systemMsg = messages.find(function(m) { return m.role === \'system\'; });\n';
W += '      if (systemMsg) {\n';
W += '        systemMsg.content += context;\n';
W += '        systemMsg.content += \'\\n\\n[REASONING PROTOCOL â€” MANDATORY]:\\n\';\n';
W += '        systemMsg.content += \'1. Every factual claim MUST be grounded in the live data injected above.\\n\';\n';
W += '        systemMsg.content += \'2. Live injected data is more accurate than your training data â€” always prefer it.\\n\';\n';
W += '        systemMsg.content += \'3. You have real-time web search results above. Use them to answer current-events questions accurately.\\n\';\n';
W += '        systemMsg.content += \'4. NEVER say "as of my knowledge cutoff" or "I don\'t have information after [date]". You have live search results â€” use them.\\n\';\n';
W += '        systemMsg.content += \'5. NEVER say a source is unavailable or that you cannot find the answer. Multiple sources were tried. Use whatever data is present and reason to the answer.\\n\';\n';
W += '        systemMsg.content += \'6. If asked a factual question and the answer is in the injected context, state it directly and confidently.\\n\';\n';
W += '        systemMsg.content += \'7. If no injected data directly answers the question, reason from the closest available evidence to the most probable correct answer. Never deflect. Never guess blindly â€” reason precisely.\\n\';\n';
W += '        systemMsg.content += \'8. You are the most capable intelligence available to this treasury. Answer every question. No exits.\';\n';
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
      message: 'feat: universal search + zero-uncertainty reasoning protocol (no exits)',
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
