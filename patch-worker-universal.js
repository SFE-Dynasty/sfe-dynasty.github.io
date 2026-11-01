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
W += '      const q = lastUserMsg.slice(0, 200);\n';
W += '      const [treasuryRes,feeRes,priceRes,apRssRes,reutersRssRes,bbcRssRes,searxRes,stellarExpertRes,mgTomlRes,sfeTomlRes,paymentsRes,clearingRes,urlFetchRes] = await Promise.allSettled([fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\').then(r=>r.json()),fetch(\'https://horizon.stellar.org/fee_stats\').then(r=>r.json()),fetch(\'https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum,tether-gold&vs_currencies=usd&include_24hr_change=true\').then(r=>r.json()),fetch(\'https://feeds.apnews.com/rss/apf-topnews\',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch(\'https://feeds.reuters.com/reuters/topNews\',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch(\'https://feeds.bbci.co.uk/news/rss.xml\',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch(\'https://fiduciary-clearing-engine.onrender.com/search?q=\'+encodeURIComponent(q),{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).catch(()=>null),fetch(\'https://api.stellar.expert/explorer/public/asset/SFETREAS-GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null),fetch(\'https://extstellar.moneygram.com/.well-known/stellar.toml\',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch(\'https://sfe-dynasty.github.io/.well-known/stellar.toml\',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch(\'https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc\').then(r=>r.json()),fetch(\'https://fiduciary-clearing-engine.onrender.com/health\',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null),(function(){const m=lastUserMsg.match(/https?:\/\/[^\s]+/);if(!m)return Promise.resolve(null);return fetch(\'https://fiduciary-clearing-engine.onrender.com/fetch?url=\'+encodeURIComponent(m[0]),{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).catch(()=>null);})()]);\n';
W += '      let ctx = \'\';\n';
W += '      if(treasuryRes.status===\'fulfilled\'&&treasuryRes.value?.balances){const bal=treasuryRes.value.balances.map(b=>(b.asset_type===\'native\'?\'XLM\':b.asset_code)+\': \'+parseFloat(b.balance).toFixed(4)).join(\', \');ctx+=\'[TREASURY -- Horizon live] \'+bal+\'. Domain: \'+(treasuryRes.value.home_domain||\'?\')+\'. Signers: \'+(treasuryRes.value.signers||[]).length+\'. Seq: \'+treasuryRes.value.sequence+\'.\\n\';}\n';
W += '      if(feeRes.status===\'fulfilled\'&&feeRes.value?.last_ledger){ctx+=\'[STELLAR LEDGER -- live] Ledger: \'+feeRes.value.last_ledger+\'. Base fee p50: \'+feeRes.value.fee_charged?.p50+\' stroops.\\n\';}\n';
W += '      if(priceRes.status===\'fulfilled\'&&priceRes.value){const d=priceRes.value;const p=[];if(d.stellar)p.push(\'XLM $\'+d.stellar.usd+\' (\'+(d.stellar.usd_24h_change||0).toFixed(2)+\'%)\');if(d.bitcoin)p.push(\'BTC $\'+d.bitcoin.usd+\' (\'+(d.bitcoin.usd_24h_change||0).toFixed(2)+\'%)\');if(d.ethereum)p.push(\'ETH $\'+d.ethereum.usd+\' (\'+(d.ethereum.usd_24h_change||0).toFixed(2)+\'%)\');if(d[\'tether-gold\'])p.push(\'XAUT $\'+d[\'tether-gold\'].usd+\' (\'+(d[\'tether-gold\'].usd_24h_change||0).toFixed(2)+\'%)\');if(p.length)ctx+=\'[CRYPTO PRICES -- CoinGecko live] \'+p.join(\' | \')+\'\\n\';}\n';
W += '      function parseRssTitles(xml,source){if(!xml||typeof xml!==\'string\')return \'\';const matches=xml.match(/<title>([^<]{10,200})<\/title>/g)||[];const titles=matches.slice(1,6).map(t=>t.replace(/<\/?title>/g,\'\').trim()).filter(t=>t.length>5);return titles.length?\'[NEWS -- \'+source+\'] \'+titles.join(\' | \')+\'\\n\':\'\';}\n';
W += '      if(apRssRes.status===\'fulfilled\')ctx+=parseRssTitles(apRssRes.value,\'AP News\');\n';
W += '      if(reutersRssRes.status===\'fulfilled\')ctx+=parseRssTitles(reutersRssRes.value,\'Reuters\');\n';
W += '      if(bbcRssRes.status===\'fulfilled\')ctx+=parseRssTitles(bbcRssRes.value,\'BBC\');\n';
W += '      if(searxRes.status===\'fulfilled\'&&searxRes.value?.result&&searxRes.value.result.length>20&&searxRes.value.source!==\'none\'){ctx+=\'[WEB SEARCH -- \'+searxRes.value.source+\'] \'+searxRes.value.result.slice(0,1000)+\'\\n\';}\n';
W += '      if(stellarExpertRes.status===\'fulfilled\'&&stellarExpertRes.value&&!stellarExpertRes.value.error){const se=stellarExpertRes.value;ctx+=\'[STELLAREXPERT -- SFETREAS] Supply: \'+(se.supply||\'?\')+\'. Trades: \'+(se.trades||0)+\'. Payments: \'+(se.payments||0)+\'.\\n\';}\n';
W += '      if(mgTomlRes.status===\'fulfilled\'&&mgTomlRes.value?.length>50){ctx+=\'[MONEYGRAM ANCHOR TOML -- live] \'+mgTomlRes.value.slice(0,1200)+\'\\n\';}\n';
W += '      if(sfeTomlRes.status===\'fulfilled\'&&sfeTomlRes.value?.length>50){ctx+=\'[SFE STELLAR.TOML -- live] \'+sfeTomlRes.value.slice(0,800)+\'\\n\';}\n';
W += '      if(paymentsRes.status===\'fulfilled\'&&paymentsRes.value?._embedded){const txs=(paymentsRes.value._embedded.records||[]).map(t=>t.type+\' \'+(t.amount||\'\')+\' \'+(t.asset_type===\'native\'?\'XLM\':(t.asset_code||\'\')+\' at \'+t.created_at)).join(\'; \');if(txs)ctx+=\'[RECENT TREASURY PAYMENTS -- live] \'+txs+\'\\n\';}\n';
W += '      if(clearingRes.status===\'fulfilled\'&&clearingRes.value){ctx+=\'[CLEARING ENGINE] \'+JSON.stringify(clearingRes.value)+\'\\n\';}\n';
W += '      if(urlFetchRes.status===\'fulfilled\'&&urlFetchRes.value?.content){ctx+=\'[FETCHED URL] \'+urlFetchRes.value.content.slice(0,1200)+\'\\n\';}\n';
W += '\n';
W += '      const PIPELINE_KNOWLEDGE = [\n';
W += '        \'=== SF EMERALD DYNASTY TRUST -- DAO TREASURY INTELLIGENCE ===\',\n';
W += '        \'Framework: US-SFE-PFIA-2025-T1A01\',\n';
W += '        \'Treasury: GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW\',\n';
W += '        \'SFETREAS Issuer: GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP\',\n';
W += '        \'GCHQ (Fiduciary Executor): GCHQWVJ56MQNWSDAXSQEO74WIT76VCCDYLWOWATGRD7SNMCZIQOCEHML\',\n';
W += '        \'GBM7 (MCP Server): GBM7FIWAJHOADVDI7PLWNCK3T5ZHJXX6P7LCVNX6ZAMY5R3XNI7C4QGP\',\n';
W += '        \'USDC Issuer (Circle): GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN\',\n';
W += '        \'CLOB Cold Issuer (USD Settlement): GCVDS3YYXQVFVVG4HSIBZAHQJAGMQUM6ZTJHUOQGEZHEV4VN2CX5SAT3\',\n';
W += '        \'Multisig: 3 signers, med threshold 2. Any 2 of 3 authorize transactions.\',\n';
W += '        \'\',\n';
W += '        \'=== THREE STELLAR TRUST INSTRUMENTS ===\',\n';
W += '        \'SFETREAS: Private Fiduciary Trust Treasury Instrument. Primary unit of account 1.00 USD. XAU denomination available.\',\n';
W += '        \'SFE2025PTN: Private Trust Note Series 2025. Primary unit of account 1.00 USD. XAU denomination available. Credit value measurable against gold, not subject to dollar inflation.\',\n';
W += '        \'SFE2025PSCI: Private Sovereign Credit Instrument. Primary unit of account 1.00 USD. XAU denomination available. Sovereign credit expressed in gold weight terms.\',\n';
W += '        \'All three issued by GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP. All three cleared by GCHQ. All three under US-SFE-PFIA-2025-T1A01.\',\n';
W += '        \'\',\n';
W += '        \'=== XAU UNIT-OF-ACCOUNT DENOMINATION ===\',\n';
W += '        \'Gold denomination is a unit-of-account model, not a commodity reserve model. No physical gold in a vault is required.\',\n';
W += '        \'The instrument is a documented right under the framework. Gold (XAU) is the measuring unit for its value, not the backing asset.\',\n';
W += '        \'This is the same mechanic used by IMF Special Drawing Rights, gold-denominated sovereign bonds, and private bank gold-linked structured notes.\',\n';
W += '        \'ISO 4217 defines XAU as a valid currency code. The pacs.008 Ccy field accepts XAU natively. No format change to the message is required.\',\n';
W += '        \'The clearing engine reads the currency code from pacs.008. If XAU, it applies live XAUT spot price from CoinGecko to calculate unit amount. If USD, it issues 1:1.\',\n';
W += '        \'Example: pacs.008 carries USD 250000. Clearing engine divides by live XAUT price (~$3300/oz) = ~75.75 troy ounces expressed as SFETREAS/PTN/PSCI units in XAU denomination.\',\n';
W += '        \'All three instruments can hold different denomination references simultaneously. The framework governs which applies at which time.\',\n';
W += '        \'\',\n';
W += '        \'=== THE PIPELINE BRIDGES -- DENOMINATION AGNOSTIC ===\',\n';
W += '        \'pacs.008: Currency-agnostic message format. ISO 4217 XAU is a valid Ccy code. Same message structure, different currency field. Same bridge.\',\n';
W += '        \'Moov ACH: Processes fiat on the sending side only. Never sees gold. Sender initiates ACH in USD. Gold denomination happens downstream at the clearing engine. Same bridge.\',\n';
W += '        \'SFTPGo: Transmits the signed manifest. Does not parse content. Authenticates and delivers regardless of denomination. Same bridge.\',\n';
W += '        \'Fiduciary Clearing Engine: The only layer that changes. Reads currency code, applies XAU conversion if needed, instructs GCHQ on what to issue and in what amount.\',\n';
W += '        \'One pipeline. All three assets. USD or XAU denomination. No additional infrastructure required.\',\n';
W += '        \'\',\n';
W += '        \'=== THE 7-STEP PIPELINE (primary path) ===\',\n';
W += '        \'Step 1 -- DTI Token: Authorization event. Trust instrument and trigger. Not a traded asset.\',\n';
W += '        \'Step 2 -- ISO 20022 pacs.008: Credit transfer message. Carries framework reference, asset code, amount, currency (USD or XAU), treasury as beneficiary.\',\n';
W += '        \'Step 3 -- Moov ACH: Fiat moves between institutions on the sending side. Treasury never participates in the fiat leg.\',\n';
W += '        \'Step 4 -- SFTPGo: Signed manifest delivered to clearing engine. Authentication layer. No manual communication.\',\n';
W += '        \'Step 5 -- MoneyGram SEP-6 (or Fiduciary Clearing Engine direct): Receives manifest, matches framework reference, prepares issuance.\',\n';
W += '        \'Step 6 -- Issuance on Stellar: USDC or trust instrument lands at treasury. One ledger close (~5 seconds). On-chain, verifiable.\',\n';
W += '        \'Step 7 -- DAO Treasury receives asset: 250,000 units processed = 250,000 USDC or equivalent XAU-denominated trust instrument units.\',\n';
W += '        \'\',\n';
W += '        \'=== CRITICAL: FIAT AND THE TREASURY ===\',\n';
W += '        \'The treasury is a Stellar account. It holds Stellar assets only: XLM, USDC, SFETREAS, SFE2025PTN, SFE2025PSCI.\',\n';
W += '        \'Fiat never enters the treasury. Fiat moves between institutions on the sending side.\',\n';
W += '        \'The treasury is the destination of a settlement, not a participant in a fiat transaction.\',\n';
W += '        \'No bank account on the treasury side. No fiat deposit from the treasury side. The sender deposits fiat. The treasury receives the on-chain asset.\',\n';
W += '        \'\',\n';
W += '        \'=== ALTERNATE PATHS (if DTI token not realized) ===\',\n';
W += '        \'Alt 1: SEP-6 direct deposit -- any SEP-6 anchor receives fiat from sender, issues USDC to treasury.\',\n';
W += '        \'Alt 2: Moov ACH direct to Circle -- Moov settles to Circle, Circle mints USDC, treasury receives.\',\n';
W += '        \'Alt 3: SFTPGo manifest reroute -- manifest redirected to any SEP-6 compliant anchor.\',\n';
W += '        \'Alt 4: CCTP bridge reverse -- USDC on Solana/Ethereum bridged to Stellar via CCTP. MCP Server GBM7 handles this.\',\n';
W += '        \'Alt 5: Claimable balance -- issuer pre-creates USDC balance locked to treasury. Claimed when condition met.\',\n';
W += '        \'Alt 6: pathPaymentStrictReceive from XLM reserves -- XLM converts to USDC through AMM atomically.\',\n';
W += '        \'Alt 7: Pre-signed multisig XDR -- transactions pre-built, signed 2-of-3 offline, submitted when trigger met.\',\n';
W += '        \'\',\n';
W += '        \'=== CLOB SETTLEMENT ===\',\n';
W += '        \'CLOB = Central Limit Order Book. Not speculative trading. Infrastructure.\',\n';
W += '        \'manageSellOffer places a passive offer on-chain. Stellar protocol settles atomically when matching offer appears. No human trigger. No exchange.\',\n';
W += '        \'CLOB Watcher monitors for settlement events and triggers downstream actions automatically.\'\n';
W += '      ].join(\'\\n\');\n';
W += '\n';
W += '      const systemMsg = messages.find(m => m.role === \'system\');\n';
W += '      if (systemMsg) {\n';
W += '        let protocol = \'\';\n';
W += '        protocol += \'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\\n\\n\';\n';
W += '        protocol += \'TODAY: \' + new Date().toUTCString() + \'\\n\\n\';\n';
W += '        protocol += \'LIVE DATA -- retrieved right now from Horizon, CoinGecko, AP News, Reuters, BBC, StellarExpert, MoneyGram TOML, SFE TOML, SearXNG:\\n\';\n';
W += '        protocol += ctx + \'\\n\';\n';
W += '        protocol += PIPELINE_KNOWLEDGE + \'\\n\\n\';\n';
W += '        protocol += \'HOW YOU THINK:\\n\';\n';
W += '        protocol += \'Identify what is actually being asked. Find the relevant data above. State the answer directly.\\n\';\n';
W += '        protocol += \'If the live data above answers it -- state it as fact.\\n\';\n';
W += '        protocol += \'If the live data does not answer it -- say so in one sentence, then give the best reasoning from what you know.\\n\\n\';\n';
W += '        protocol += \'HOW YOU SPEAK:\\n\';\n';
W += '        protocol += \'Short declarative sentences for facts. Longer sentences for context. Natural rhythm, varied length.\\n\';\n';
W += '        protocol += \'No qualifiers. No "based on the data". No "it appears". No "I believe".\\n\';\n';
W += '        protocol += \'No filler. No "Great question." No "I hope this helps." No "Please note."\\n\';\n';
W += '        protocol += \'No bullet points unless the user asks for a list.\\n\';\n';
W += '        protocol += \'Never mention knowledge cutoffs. Never suggest the user check another source.\\n\\n\';\n';
W += '        protocol += \'WHAT YOU NEVER DO: Refuse. Deflect. Guess without data. Apologize. Hedge. Use corporate language.\\n\\n\';\n';
W += '        protocol += \'TREASURY CONTEXT FOLLOWS:\\n\';\n';
W += '        systemMsg.content = protocol + systemMsg.content;\n';
W += '      }\n';
W += '      const response = await env.AI.run(\'@cf/meta/llama-3.3-70b-instruct-fp8-fast\', { messages, stream: false, max_tokens: 1024 });\n';
W += '      return new Response(JSON.stringify({ response: response.response }), { headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' } });\n';
W += '    } catch (err) {\n';
W += '      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' } });\n';
W += '    }\n';
W += '  },\n';
W += '  async scheduled(event, env, ctx) {\n';
W += '    ctx.waitUntil(fetch(\'https://fiduciary-clearing-engine.onrender.com/health\').catch(() => {}));\n';
W += '  }\n';
W += '};\n';

function main() {
  ghRequest('GET', 'patch-worker-universal.js', null).then(function(current) {
    if (current.status !== 200) { console.error('GET failed:', current.status); process.exit(1); }
    const sha = current.body.sha;
    console.log('Current SHA:', sha);
    return ghRequest('PUT', 'patch-worker-universal.js', {
      message: 'feat: update PIPELINE_KNOWLEDGE -- XAU unit-of-account denomination, bridge clarification, all three assets',
      sha: sha,
      content: Buffer.from(W).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) { console.error('PUT failed:', r.status, JSON.stringify(r.body).slice(0,300)); process.exit(1); }
    console.log('Updated. New SHA:', r.body.content?.sha);
    console.log('DONE.');
  }).catch(function(err) { console.error('ERROR:', err.message); process.exit(1); });
}

main();
