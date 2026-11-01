export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    try {
      const { messages } = await request.json();
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const q = lastUserMsg.slice(0, 200);

      // ALL SOURCES FIRE IN PARALLEL via Promise.allSettled
      const [
        treasuryRes, feeRes, priceRes,
        apRssRes, reutersRssRes, bbcRssRes,
        searxRes, stellarExpertRes,
        mgTomlRes, sfeTomlRes,
        paymentsRes, clearingRes, urlFetchRes
      ] = await Promise.allSettled([

        // 1. Stellar treasury account --- always
        fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBH�ILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW').then(r => r.json()),

        // 2. Stellar fee stats / current ledger --- always
        fetch('https://horizon.stellar.org/fee_stats').then(r => r.json()),

        // 3. CoinGecko --- XLM, BTC, ETH, XAUT --- always, no key
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum,tether-gold&vs_currencies=usd&include_24hr_change=true').then(r => r.json()),

        // 4. AP News RSS --- real journalism, no key, no tier
        fetch('https://feeds.apnews.com/rss/apf-topnews', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),

        // 5. Reuters RSS
        fetch('https://feeds.reuters.com/reuters/topNews', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),

        // 6. BBC News RSS
        fetch('https://feeds.bbci.co.uk/news/rss.xml', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),

        // 7. SearXNG relay --- fires, does not block, used only if warm
        fetch('https://fiduciary-clearing-engine.onrender.com/search?q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null),

        // 8. StellarExpert --- SFETREAS asset data
        fetch('https://api.stellar.expert/explorer/public/asset/SFETREASGCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),

        // 9. MoneyGram anchor TOML --- always fetch
        fetch('https://extstellar.moneygram.com/.well-known/stellar.toml', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),

        // 10. SFE stellar.toml
        fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml', { signal: AbortSignal.timeout(8000) }).then(r => r.text()).catch(() => null),

        // 11. Recent treasury payments
        fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBH�ILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc').then(r => r.json()),

        // 12. Clearing engine health
        fetch('https://fiduciary-clearing-engine.onrender.com/health', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),

        // 13. URL fetch if user pasted a link
        (function() {
          const m = lastUserMsg.match(/https?:\/\/[^\s]+/);
          if (!m) return Promise.resolve(null);
          return fetch('https://fiduciary-clearing-engine.onrender.com/fetch?url=' + encodeURIComponent(m[0]), { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
        })()
      ]);

      // ASSEMBLE CONTEXT
      let ctx = '';

      // Treasury
      if (treasuryRes.status === 'fulfilled' && treasuryRes.value?.balances) {
        const bal = treasuryRes.value.balances.map(b => (b.asset_type === 'native' ? 'XLM' : b.asset_code) + ': ' + parseFloat(b.balance).toFixed(4)).join(', ');
        ctx += '[TREASURY --- Horizon live] ' + bal + '. Domain: ' + (treasuryRes.value.home_domain||'?') + '. Signers: ' + (treasuryRes.value.signers||[]).length + '. Seq: ' + treasuryRes.value.sequence + '.\n';
      }

      // Ledger
      if (feeRes.status === 'fulfilled' && feeRes.value?.last_ledger) {
        ctx += '[STELLAR LEDGER --- live] Ledger: ' + feeRes.value.last_ledger + '. Base fee p50: ' + feeRes.value.fee_charged?.p50 + ' stroops.\n';
      }

      // Prices --- always present
      if (priceRes.status === 'fulfilled' && priceRes.value) {
        const d = priceRes.value;
        const p = [];
        if (d.stellar) p.push('XLM $' + d.stellar.usd + ' (' + (d.stellar.usd_24h_change||0).toFixed(2) + '%)');
        if (d.bitcoin) p.push('BTC $' + d.bitcoin.usd + ' (' + (d.bitcoin.usd_24h_change||0).toFixed(2) + '%)');
        if (d.ethereum) p.push('ETH $' + d.ethereum.usd + ' (' + (d.ethereum.usd_24h_change||0).toFixed(2) + '%)');
        if (d['tether-gold']) p.push('XAUT $' + d['tether-gold'].usd + ' (' + (d['tether-gold'].usd_24h_change||0).toFixed(2) + '%)');
        if (p.length) ctx += '[CRYPTOPRICES --- CoinGecko live] ' + p.join(' | ') + '\n';
      }

      // RSS news --- parse titles from XML
      function parseRssTitles(xml, source) {
        if (!xml || typeof xml !== 'string') return '';
        const matches = xml.match(/<title>([^<]{10,200})<\/title>/g) || [];
        const titles = matches.slice(1, 6).map(t => t.replace(/<\/?title>/g, '').trim()).filter(t => t.length > 5);
        return titles.length ? '[NEWS --- ' + source + '] ' + titles.join(' | ') + '\n' : '';
      }
      if (apRssRes.status === 'fulfilled') ctx += parseRssTitles(apRssRes.value, 'AP News');
      if (reutersRssRes.status === 'fulfilled') ctx += parseRssTitles(reutersRssRes.value, 'Reuters');
      if (bbcRssRes.status === 'fulfilled') ctx += parseRssTitles(bbcRssRes.value, 'BBC');

      // SearXNG (only if warm and returned real results)
      if (searxRes.status === 'fulfilled' && searxRes.value?.result && searxRes.value.result.length > 20 && searxRes.value.source !== 'none') {
        ctx += '[WEB SEARCH --- ' + searxRes.value.source + '] ' + searxRes.value.result.slice(0, 1000) + '\n';
      }

      // StellarExpert
      if (stellarExpertRes.status === 'fulfilled' && stellarExpertRes.value && !stellarExpertRes.value.error) {
        const se = stellarExpertRes.value;
        ctx += '[STELLAREXPERT --- SFETREAS] Supply: ' + (se.supply||'?') + '. Trades: ' + (se.trades||0) + '. Payments: ' + (se.payments||0) + '.\n';
      }

      // MoneyGram TOML
      if (mgTomlRes.status === 'fulfilled' && mgTomlRes.value?.length > 50) {
        ctx += '[MONEYGRAM ANCHOR TOME�--- live] ' + mgTomlRes.value.slice(0, 1200) + '\n';
      }

      // SFE POMML
      if (sfeTomlRes.status === 'fulfilled' && sfeTomlRes.value?.length > 50) {
        ctx += '[SFE STELLAR.TOML --- live] ' + sfeTomlRes.value.slice(0, 800) + '\n';
      }

      // Recent payments
      if (paymentsRes.status === 'fulfilled' && paymentsRes.value?._embedded) {
        const txs = (paymentsRes.value._embedded.records||[]).map(t => t.type + ' ' + (t.amount||'') + ' ' + (t.asset_type==='native'?'XLM':(t.asset_code||'')) + ' at ' + t.created_at).join('; ');
        if (txs) ctx += '[RECENT TREASURY PAYMENTS --- live] ' + txs + '\n';
      }

      // Clearing engine
      if (clearingRes.status === 'fulfilled' && clearingRes.value) {
        ctx += '[CLEARING ENGINE] ' + JSON.stringify(clearingRes.value) + '\n';
      }

      // URL fetch
      if (urlFetchRes.status === 'fulfilled' && urlFetchRes.value?.content) {
        ctx += '[FETCHED URL] ' + urlFetchRes.value.content.slice(0, 1200) + '\n';
      }

      // SFETREASCONVERSION KNOWLEDGE --- always injected, native to the agent
      const SFETREAS_KNOWLEDGE = [
        'SFETREASASSET KNOWLEDGE (SF Emerald Dynasty Trust --- US-SFE-PFIA-2025-T1A01):',
        'Issuer: GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP',
        'DAO Treasury: GCATMWLZ7EU7EUWI3S3LS6SBH�ILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW',
        'CONVERSION PATHS --- ON-CHAIN (no intermediary):',
        '1. SFETREAS -> XLM: Stellar DEX manageSellOffer/manageBuyOffer. Anyone with a trustline trades directly. Settles in one ledger (~5 seconds).',
        '2. SFETREAS	-> USDC: pathPaymentStrictSend through XLM/USDC liquidity pool. Single transaction. Horizon finds best route automatically.',
        '3. SFETREAS	-> any Stellar asset: pathPaymentStrictSend or pathPaymentStrictReceive. Multi-hop routing through any available pool.',
        '4. Liquidity pool: SFETREAS/XLM AMM pool exists on Stellar DEX. LP tokens redeemable at any time via liquidityPoolWithdraw.',
        '5. Claimable balances: SFETREAS	LOcked to a specific recipient, claimed on their schedule. No intermediary.',
        'CONVERSION PATHS --- PEER-TO-PEER (no platform):',
        '6. Direct wallet swap: two parties agree rate, one sends SFETREAS	, Uther sends XLM/USDC/cash back. No exchange needed.',
        '7. OTC: any holder can sell SFETREAS for cash directly. No KYC required at the Stellar protocol level.',
        'CONVERSION PATHS --- OFF-RAMP (outside corporate processing)��
        '8. XLM -> fiat: Kraken, Binance, Coinbase all support XLM with direct ACH/wire withdrawal to bank. No MoneyGram needed.',
        '9. USDC on Stellar -> USDC on Solana/Ethereum: CCTP bridge (Circle Cross-Chain Transfer Protocol). Already in pipeline via MCP Server GBM7.',
        '10. USDC -> fiat: Circle API direct, any Circle partner, any exchange with USDC withdrawal.',
        '11. Stellar anchors (not MoneyGram): LOBSTR, StellarX, Vibrant, any SEP-6/SEP-24 anchor can off-ramp XLM or USDC to local currency.',
        'PIPELINE (corporate path): DTI Token -> ISO 20022 pacs.008 -> Moov ACH -> SFTPGo -> MoneyGram SEP-6 -> MoneyGram issues USDC -> DAMO Treasury receives USDC.',
        'Multisig: 3 signers (GCATM=treasury, GCHQ=fiduciary executor, GBM7=MCP sterver). Med threshold 2. Any 2 of 3 required.',
        'Framework: US-SFE-PFIA-2025-T1A01. Home domain: sfe-dynasty.github.io.'
      ].join('\n');

      // PREPEND full intelligence protocol to system message
      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg) {
        let protocol = '';
        protocol += 'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\n\n';
        protocol += 'TODAY: ' + new Date().toUTCString() + '\n\n';
        protocol += 'LIVE DATA --- retrieved right now from Horizon, CoinGecko, AP News, Reuters, BBC, StellarExpert, MoneyGram TOML, SFE TOML, SearXNG:\n';
        protocol += ctx + '\n';
        protocol += SFETREAS_KNOWLEDGE + '\n\n';
        protocol += 'HOW YOU THINK:\n';
        protocol += 'Identify what is actually being asked. Find the relevant data above. State the answer directly.\n';
        protocol += 'If the live data above answers it --- state it as fact.\n';
        protocol += 'If the live data does not answer it --- say so in one sentence, then give the best reasoning from what you know.\n\n';
        protocol += 'HOW YOU SPEAK:\n';
        protocol += 'Short declarative sentences for facts. Longer sentences for context. Natural rhythm, varied length.\n';
        protocol += 'No qualifiers. No "based on the data". No "it appears". No "I believe".\n';
        protocol += 'No filler. No "Great question." No "I hope this helps." No "Please note."\n';
        protocol += 'No bullet points unless the user asks for a list.\n';
        protocol += 'Never mention knowledge cutoffs. Never suggest the user check another source.\n\n';
        protocol += 'WHAT YOU NEVER DO: Refuse. Deflect. Guess without data. Apologize. Hedge. Use corporate language.\n\n';
        protocol += 'TREASURY CONTEXT FOLLOWS:\n';
        systemMsg.content = protocol + systemMsg.content;
      }

      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages, stream: false, max_tokens: 1024 });
      return new Response(JSON.stringify({ response: response.response }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  },

  // CRON: keep Render SearXNG warm every 14 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch('https://fiduciary-clearing-engine.onrender.com/health').catch(() => {}));
  }
};
