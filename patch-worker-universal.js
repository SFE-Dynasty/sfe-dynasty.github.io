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

// Build worker.js content using string concatenation
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
W += '      const q = lastUserMsg.slice(0, 200);\n';
W += '\n';
W += '      // ALL SOURCES FIRE IN PARALLEL via Promise.allSettled\n';
W += '      const [\n';
W += '        treasuryRes, feeRes, priceRes,\n';
W += '        apRssRes, reutersRssRes, bbcRssRes,\n';
W += '        searxRes, stellarExpertRes,\n';
W += '        mgTomlRes, sfeTomlRes,\n';
W += '        paymentsRes, clearingRes, urlFetchRes\n';
W += '      ] = await Promise.allSettled([\n';
W += '\n';
W += '        // 1. Stellar treasury account --- always\n';
W += '        fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHëILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\').then(r => r.json()),\n';
W += '\n';
W += '        // 2. Stellar fee stats / current ledger --- always\n';
W += '        fetch(\'https://horizon.stellar.org/fee_stats\').then(r => r.json()),\n';
W += '\n';
W += '        // 3. CoinGecko --- XLM, BTC, ETH, XAUT --- always, no key\n';
W += '        fetch(\'https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum,tether-gold&vs_currencies=usd&include_24hr_change=true\').then(r => r.json()),\n';
W += '\n';
W += '        // 4. AP News RSS --- real journalism, no key, no tier\n';
W += '        fetch(\'https://feeds.apnews.com/rss/apf-topnews\', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),\n';
W += '\n';
W += '        // 5. Reuters RSS\n';
W += '        fetch(\'https://feeds.reuters.com/reuters/topNews\', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),\n';
W += '\n';
W += '        // 6. BBC News RSS\n';
W += '        fetch(\'https://feeds.bbci.co.uk/news/rss.xml\', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),\n';
W += '\n';
W += '        // 7. SearXNG relay --- fires, does not block, used only if warm\n';
W += '        fetch(\'https://fiduciary-clearing-engine.onrender.com/search?q=\' + encodeURIComponent(q), { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null),\n';
W += '\n';
W += '        // 8. StellarExpert --- SFETREAS asset data\n';
W += '        fetch(\'https://api.stellar.expert/explorer/public/asset/SFETREASGCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),\n';
W += '\n';
W += '        // 9. MoneyGram anchor TOML --- always fetch\n';
W += '        fetch(\'https://extstellar.moneygram.com/.well-known/stellar.toml\', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),\n';
W += '\n';
W += '        // 10. SFE stellar.toml\n';
W += '        fetch(\'https://sfe-dynasty.github.io/.well-known/stellar.toml\', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),\n';
W += '\n';
W += '        // 11. Recent treasury payments\n';
W += '        fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHëILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc\').then(r => r.json()),\n';
W += '\n';
W += '        // 12. Clearing engine health\n';
W += '        fetch(\'https://fiduciary-clearing-engine.onrender.com/health\', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),\n';
W += '\n';
W += '        // 13. URL fetch if user pasted a link\n';
W += '        (function() {\n';
W += '          const m = lastUserMsg.match(/https?:\\/\\/[^\\s]+/);\n';
W += '          if (!m) return Promise.resolve(null);\n';
W += '          return fetch(\'https://fiduciary-clearing-engine.onrender.com/fetch?url=\' + encodeURIComponent(m[0]), { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);\n';
W += '        })()\n';
W += '      ]);\n';
W += '\n';
W += '      // ASSEMBLE CONTEXT\n';
W += '      let ctx = \'\';\n';
W += '\n';
W += '      // Treasury\n';
W += '      if (treasuryRes.status === \'fulfilled\' && treasuryRes.value?.balances) {\n';
W += '        const bal = treasuryRes.value.balances.map(b => (b.asset_type === \'native\' ? \'XLM\' : b.asset_code) + \': \' + parseFloat(b.balance).toFixed(4)).join(\', \');\n';
W += '        ctx += \'[TREASURY --- Horizon live] \' + bal + \'. Domain: \' + (treasuryRes.value.home_domain||\'?\') + \'. Signers: \' + (treasuryRes.value.signers||[]).length + \'. Seq: \' + treasuryRes.value.sequence + \'.\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // Ledger\n';
W += '      if (feeRes.status === \'fulfilled\' && feeRes.value?.last_ledger) {\n';
W += '        ctx += \'[STELLAR LEDGER --- live] Ledger: \' + feeRes.value.last_ledger + \'. Base fee p50: \' + feeRes.value.fee_charged?.p50 + \' stroops.\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // Prices --- always present\n';
W += '      if (priceRes.status === \'fulfilled\' && priceRes.value) {\n';
W += '        const d = priceRes.value;\n';
W += '        const p = [];\n';
W += '        if (d.stellar) p.push(\'XLM $\' + d.stellar.usd + \' (\' + (d.stellar.usd_24h_change||0).toFixed(2) + \'%)\');\n';
W += '        if (d.bitcoin) p.push(\'BTC $\' + d.bitcoin.usd + \' (\' + (d.bitcoin.usd_24h_change||0).toFixed(2) + \'%)\');\n';
W += '        if (d.ethereum) p.push(\'ETH $\' + d.ethereum.usd + \' (\' + (d.ethereum.usd_24h_change||0).toFixed(2) + \'%)\');\n';
W += '        if (d[\'tether-gold\']) p.push(\'XAUT $\' + d[\'tether-gold\'].usd + \' (\' + (d[\'tether-gold\'].usd_24h_change||0).toFixed(2) + \'%)\');\n';
W += '        if (p.length) ctx += \'[CRYPTOPRICES --- CoinGecko live] \' + p.join(\' | \') + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // RSS news --- parse titles from XML\n';
W += '      function parseRssTitles(xml, source) {\n';
W += '        if (!xml || typeof xml !== \'string\') return \'\';\n';
W += '        const matches = xml.match(/<title>([^<]{10,200})<\\/title>/g) || [];\n';
W += '        const titles = matches.slice(1, 6).map(t => t.replace(/<\\/?title>/g, \'\').trim()).filter(t => t.length > 5);\n';
W += '        return titles.length ? \'[NEWS --- \' + source + \'] \' + titles.join(\' | \') + \'\\n\' : \'\';\n';
W += '      }\n';
W += '      if (apRssRes.status === \'fulfilled\') ctx += parseRssTitles(apRssRes.value, \'AP News\');\n';
W += '      if (reutersRssRes.status === \'fulfilled\') ctx += parseRssTitles(reutersRssRes.value, \'Reuters\');\n';
W += '      if (bbcRssRes.status === \'fulfilled\') ctx += parseRssTitles(bbcRssRes.value, \'BBC\');\n';
W += '\n';
W += '      // SearXNG (only if warm and returned real results)\n';
W += '      if (searxRes.status === \'fulfilled\' && searxRes.value?.result && searxRes.value.result.length > 20 && searxRes.value.source !== \'none\') {\n';
W += '        ctx += \'[WEB SEARCH --- \' + searxRes.value.source + \'] \' + searxRes.value.result.slice(0, 1000) + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // StellarExpert\n';
W += '      if (stellarExpertRes.status === \'fulfilled\' && stellarExpertRes.value && !stellarExpertRes.value.error) {\n';
W += '        const se = stellarExpertRes.value;\n';
W += '        ctx += \'[STELLAREXPERT --- SFETREAS] Supply: \' + (se.supply||\'?\') + \'. Trades: \' + (se.trades||0) + \'. Payments: \' + (se.payments||0) + \'.\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // MoneyGram TOML\n';
W += '      if (mgTomlRes.status === \'fulfilled\' && mgTomlRes.value?.length > 50) {\n';
W += '        ctx += \'[MONEYGRAM ANCHOR TOME‰--- live] \' + mgTomlRes.value.slice(0, 1200) + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // SFE POMML\n';
W += '      if (sfeTomlRes.status === \'fulfilled\' && sfeTomlRes.value?.length > 50) {\n';
W += '        ctx += \'[SFE STELLAR.TOML --- live] \' + sfeTomlRes.value.slice(0, 800) + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // Recent payments\n';
W += '      if (paymentsRes.status === \'fulfilled\' && paymentsRes.value?._embedded) {\n';
W += '        const txs = (paymentsRes.value._embedded.records||[]).map(t => t.type + \' \' + (t.amount||\'\') + \' \' + (t.asset_type===\'native\'?\'XLM\':(t.asset_code||\'\')) + \' at \' + t.created_at).join(\'; \');\n';
W += '        if (txs) ctx += \'[RECENT TREASURY PAYMENTS --- live] \' + txs + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // Clearing engine\n';
W += '      if (clearingRes.status === \'fulfilled\' && clearingRes.value) {\n';
W += '        ctx += \'[CLEARING ENGINE] \' + JSON.stringify(clearingRes.value) + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // URL fetch\n';
W += '      if (urlFetchRes.status === \'fulfilled\' && urlFetchRes.value?.content) {\n';
W += '        ctx += \'[FETCHED URL] \' + urlFetchRes.value.content.slice(0, 1200) + \'\\n\';\n';
W += '      }\n';
W += '\n';
W += '      // SFETREASCONVERSION KNOWLEDGE --- always injected, native to the agent\n';
W += '      const SFETREAS_KNOWLEDGE = [\n';
W += '        \'SFETREASASSET KNOWLEDGE (SF Emerald Dynasty Trust --- US-SFE-PFIA-2025-T1A01):\',\n';
W += '        \'Issuer: GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\',\n';
W += '        \'DAO Treasury: GCATMWLZ7EU7EUWI3S3LS6SBHëILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\',\n';
W += '        \'CONVERSION PATHS --- ON-CHAIN (no intermediary):\',\n';
W += '        \'1. SFETREAS -> XLM: Stellar DEX manageSellOffer/manageBuyOffer. Anyone with a trustline trades directly. Settles in one ledger (~5 seconds).\',\n';
W += '        \'2. SFETREAS	-> USDC: pathPaymentStrictSend through XLM/USDC liquidity pool. Single transaction. Horizon finds best route automatically.\',\n';
W += '        \'3. SFETREAS	-> any Stellar asset: pathPaymentStrictSend or pathPaymentStrictReceive. Multi-hop routing through any available pool.\',\n';
W += '        \'4. Liquidity pool: SFETREAS/XLM AMM pool exists on Stellar DEX. LP tokens redeemable at any time via liquidityPoolWithdraw.\',\n';
W += '        \'5. Claimable balances: SFETREAS	LOcked to a specific recipient, claimed on their schedule. No intermediary.\',\n';
W += '        \'CONVERSION PATHS --- PEER-TO-PEER (no platform):\',\n';
W += '        \'6. Direct wallet swap: two parties agree rate, one sends SFETREAS	, Uther sends XLM/USDC/cash back. No exchange needed.\',\n';
W += '        \'7. OTC: any holder can sell SFETREAS for cash directly. No KYC required at the Stellar protocol level.\',\n';
W += '        \'CONVERSION PATHS --- OFF-RAMP (outside corporate processing)Ž‰\n';
W += '        \'8. XLM -> fiat: Kraken, Binance, Coinbase all support XLM with direct ACH/wire withdrawal to bank. No MoneyGram needed.\',\n';
W += '        \'9. USDC on Stellar -> USDC on Solana/Ethereum: CCTP bridge (Circle Cross-Chain Transfer Protocol). Already in pipeline via MCP Server GBM7.\',\n';
W += '        \'10. USDC -> fiat: Circle API direct, any Circle partner, any exchange with USDC withdrawal.\',\n';
W += '        \'11. Stellar anchors (not MoneyGram): LOBSTR, StellarX, Vibrant, any SEP-6/SEP-24 anchor can off-ramp XLM or USDC to local currency.\',\n';
W += '        \'PIPELINE (corporate path): DTI Token -> ISO 20022 pacs.008 -> Moov ACH -> SFTPGo -> MoneyGram SEP-6 -> MoneyGram issues USDC -> DAMO Treasury receives USDC.\',\n';
W += '        \'Multisig: 3 signers (GCATM=treasury, GCHQ=fiduciary executor, GBM7=MCP sterver). Med threshold 2. Any 2 of 3 required.\',\n';
W += '        \'Framework: US-SFE-PFIA-2025-T1A01. Home domain: sfe-dynasty.github.io.\'\n';
W += '      ].join(\'\\n\');\n';
W += '\n';
W += '      // PREPEND full intelligence protocol to system message\n';
W += '      const systemMsg = messages.find(m => m.role === \'system\');\n';
W += '      if (systemMsg) {\n';
W += '        let protocol = \'\';\n';
W += '        protocol += \'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\\n\\n\';\n';
W += '        protocol += \'TODAY: \' + new Date().toUTCString() + \'\\n\\n\';\n';
W += '        protocol += \'LIVE DATA --- retrieved right now from Horizon, CoinGecko, AP News, Reuters, BBC, StellarExpert, MoneyGram TOML, SFE TOML, SearXNG:\\n\';\n';
W += '        protocol += ctx + \'\\n\';\n';
W += '        protocol += SFETREAS_KNOWLEDGE + \'\\n\\n\';\n';
W += '        protocol += \'HOW YOU THINK:\\n\';\n';
W += '        protocol += \'Identify what is actually being asked. Find the relevant data above. State the answer directly.\\n\';\n';
W += '        protocol += \'If the live data above answers it --- state it as fact.\\n\';\n';
W += '        protocol += \'If the live data does not answer it --- say so in one sentence, then give the best reasoning from what you know.\\n\\n\';\n';
W += '        protocol += \'HOW YOU SPEAK:\\n\';\n';
W += '        protocol += \'Short declarative sentences for facts. Longer sentences for context. Natural rhythm, varied length.\\n\';\n';
W += '        protocol += \'No qualifiers. No \"based on the data\". No \"it appears\". No \"I believe\".\\n\';\n';
W += '        protocol += \'No filler. No \"Great question.\" No \"I hope this helps.\" No \"Please note.\"\\n\';\n';
W += '        protocol += \'No bullet points unless the user asks for a list.\\n\';\n';
W += '        protocol += \'Never mention knowledge cutoffs. Never suggest the user check another source.\\n\\n\';\n';
W += '        protocol += \'WHAT YOU NEVER DO: Refuse. Deflect. Guess without data. Apologize. Hedge. Use corporate language.\\n\\n\';\n';
W += '        protocol += \'TREASURY CONTEXT FOLLOWS:\\n\';\n';
W += '        systemMsg.content = protocol + systemMsg.content;\n';
W += '      }\n';
W += '\n';
W += '      const response = await env.AI.run(\'@cf/meta/llama-3.3-70b-instruct-fp8-fast\', { messages, stream: false, max_tokens: 1024 });\n';
W += '      return new Response(JSON.stringify({ response: response.response }), {\n';
W += '        headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' }\n';
W += '      });\n';
W += '    } catch (err) {\n';
W += '      return new Response(JSON.stringify({ error: err.message }), {\n';
W += '        status: 500, headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' }\n';
W += '      });\n';
W += '    }\n';
W += '  },\n';
W += '\n';
W += '  // CRON: keep Render SearXNG warm every 14 minutes\n';
W += '  async scheduled(event, env, ctx) {\n';
W += '    ctx.waitUntil(fetch(\'https://fiduciary-clearing-engine.onrender.com/health\').catch(() => {}));\n';
W += '  }\n';
W += '};\n';

function main() {
  ghRequest('GET', 'patch-worker-universal.js', null).then(function(current) {
    if (current.status !== 200) { console.error('GET failed:', current.status); process.exit(1); }
    const sha = current.body.sha;
    console.log('patch-worker-universal.js SHA:', sha);
    return ghRequest('PUT', 'patch-worker-universal.js', {
      message: 'feat: parallel multi-source intelligence --- Horizon, CoinGecko, AP/Reuters/BBC RSS, StellarExpert, SFETREAS conversion knowledge',
      sha: sha,
      content: Buffer.from(W).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) { console.error('PUT failed:', r.status, JSON.stringify(r.body).slice(0,300)); process.exit(1); }
    console.log('patch-worker-universal.js updated. New SHA:', r.body.content?.sha);
    console.log('DONE.');
  }).catch(function(err) { console.error('ERROR:', err.message); process.exit(1); });
}

main();
