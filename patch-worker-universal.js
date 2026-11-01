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
      const [treasuryRes,feeRes,priceRes,apRssRes,reutersRssRes,bbcRssRes,searxRes,stellarExpertRes,mgTomlRes,sfeTomlRes,paymentsRes,clearingRes,urlFetchRes] = await Promise.allSettled([fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW').then(r=>r.json()),fetch('https://horizon.stellar.org/fee_stats').then(r=>r.json()),fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum,tether-gold&vs_currencies=usd&include_24hr_change=true').then(r=>r.json()),fetch('https://feeds.apnews.com/rss/apf-topnews',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch('https://feeds.reuters.com/reuters/topNews',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch('https://feeds.bbci.co.uk/news/rss.xml',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch('https://fiduciary-clearing-engine.onrender.com/search?q='+encodeURIComponent(q),{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).catch(()=>null),fetch('https://api.stellar.expert/explorer/public/asset/SFETREAS-GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null),fetch('https://extstellar.moneygram.com/.well-known/stellar.toml',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>null),fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc').then(r=>r.json()),fetch('https://fiduciary-clearing-engine.onrender.com/health',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null),(function(){const m=lastUserMsg.match(/https?://[^s]+/);if(!m)return Promise.resolve(null);return fetch('https://fiduciary-clearing-engine.onrender.com/fetch?url='+encodeURIComponent(m[0]),{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).catch(()=>null);})()]);
      let ctx = '';
      if(treasuryRes.status==='fulfilled'&&treasuryRes.value?.balances){const bal=treasuryRes.value.balances.map(b=>(b.asset_type==='native'?'XLM':b.asset_code)+': '+parseFloat(b.balance).toFixed(4)).join(', ');ctx+='[TREASURY -- Horizon live] '+bal+'. Domain: '+(treasuryRes.value.home_domain||'?')+'. Signers: '+(treasuryRes.value.signers||[]).length+'. Seq: '+treasuryRes.value.sequence+'.\n';}
      if(feeRes.status==='fulfilled'&&feeRes.value?.last_ledger){ctx+='[STELLAR LEDGER -- live] Ledger: '+feeRes.value.last_ledger+'. Base fee p50: '+feeRes.value.fee_charged?.p50+' stroops.\n';}
      if(priceRes.status==='fulfilled'&&priceRes.value){const d=priceRes.value;const p=[];if(d.stellar)p.push('XLM $'+d.stellar.usd+' ('+(d.stellar.usd_24h_change||0).toFixed(2)+'%)');if(d.bitcoin)p.push('BTC $'+d.bitcoin.usd+' ('+(d.bitcoin.usd_24h_change||0).toFixed(2)+'%)');if(d.ethereum)p.push('ETH $'+d.ethereum.usd+' ('+(d.ethereum.usd_24h_change||0).toFixed(2)+'%)');if(d['tether-gold'])p.push('XAUT $'+d['tether-gold'].usd+' ('+(d['tether-gold'].usd_24h_change||0).toFixed(2)+'%)');if(p.length)ctx+='[CRYPTO PRICES -- CoinGecko live] '+p.join(' | ')+'\n';}
      function parseRssTitles(xml,source){if(!xml||typeof xml!=='string')return '';const matches=xml.match(/<title>([^<]{10,200})</title>/g)||[];const titles=matches.slice(1,6).map(t=>t.replace(/</?title>/g,'').trim()).filter(t=>t.length>5);return titles.length?'[NEWS -- '+source+'] '+titles.join(' | ')+'\n':'';}
      if(apRssRes.status==='fulfilled')ctx+=parseRssTitles(apRssRes.value,'AP News');
      if(reutersRssRes.status==='fulfilled')ctx+=parseRssTitles(reutersRssRes.value,'Reuters');
      if(bbcRssRes.status==='fulfilled')ctx+=parseRssTitles(bbcRssRes.value,'BBC');
      if(searxRes.status==='fulfilled'&&searxRes.value?.result&&searxRes.value.result.length>20&&searxRes.value.source!=='none'){ctx+='[WEB SEARCH -- '+searxRes.value.source+'] '+searxRes.value.result.slice(0,1000)+'\n';}
      if(stellarExpertRes.status==='fulfilled'&&stellarExpertRes.value&&!stellarExpertRes.value.error){const se=stellarExpertRes.value;ctx+='[STELLAREXPERT -- SFETREAS] Supply: '+(se.supply||'?')+'. Trades: '+(se.trades||0)+'. Payments: '+(se.payments||0)+'.\n';}
      if(mgTomlRes.status==='fulfilled'&&mgTomlRes.value?.length>50){ctx+='[MONEYGRAM ANCHOR TOML -- live] '+mgTomlRes.value.slice(0,1200)+'\n';}
      if(sfeTomlRes.status==='fulfilled'&&sfeTomlRes.value?.length>50){ctx+='[SFE STELLAR.TOML -- live] '+sfeTomlRes.value.slice(0,800)+'\n';}
      if(paymentsRes.status==='fulfilled'&&paymentsRes.value?._embedded){const txs=(paymentsRes.value._embedded.records||[]).map(t=>t.type+' '+(t.amount||'')+' '+(t.asset_type==='native'?'XLM':(t.asset_code||'')+' at '+t.created_at)).join('; ');if(txs)ctx+='[RECENT TREASURY PAYMENTS -- live] '+txs+'\n';}
      if(clearingRes.status==='fulfilled'&&clearingRes.value){ctx+='[CLEARING ENGINE] '+JSON.stringify(clearingRes.value)+'\n';}
      if(urlFetchRes.status==='fulfilled'&&urlFetchRes.value?.content){ctx+='[FETCHED URL] '+urlFetchRes.value.content.slice(0,1200)+'\n';}

      const PIPELINE_KNOWLEDGE = [
        '=== SF EMERALD DYNASTY TRUST -- DAO TREASURY INTELLIGENCE ===',
        'Framework: US-SFE-PFIA-2025-T1A01',
        'Treasury: GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW',
        'SFETREAS Issuer: GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP',
        'GCHQ (Fiduciary Executor): GCHQWVJ56MQNWSDAXSQEO74WIT76VCCDYLWOWATGRD7SNMCZIQOCEHML',
        'GBM7 (MCP Server): GBM7FIWAJHOADVDI7PLWNCK3T5ZHJXX6P7LCVNX6ZAMY5R3XNI7C4QGP',
        'USDC Issuer (Circle): GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        'CLOB Cold Issuer (USD Settlement): GCVDS3YYXQVFVVG4HSIBZAHQJAGMQUM6ZTJHUOQGEZHEV4VN2CX5SAT3',
        'Multisig: 3 signers, med threshold 2. Any 2 of 3 authorize transactions.',
        '',
        '=== THREE STELLAR TRUST INSTRUMENTS ===',
        'SFETREAS: Private Fiduciary Trust Treasury Instrument. Primary unit of account 1.00 USD. XAU denomination available.',
        'SFE2025PTN: Private Trust Note Series 2025. Primary unit of account 1.00 USD. XAU denomination available. Credit value measurable against gold, not subject to dollar inflation.',
        'SFE2025PSCI: Private Sovereign Credit Instrument. Primary unit of account 1.00 USD. XAU denomination available. Sovereign credit expressed in gold weight terms.',
        'All three issued by GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP. All three cleared by GCHQ. All three under US-SFE-PFIA-2025-T1A01.',
        '',
        '=== XAU UNIT-OF-ACCOUNT DENOMINATION ===',
        'Gold denomination is a unit-of-account model, not a commodity reserve model. No physical gold in a vault is required.',
        'The instrument is a documented right under the framework. Gold (XAU) is the measuring unit for its value, not the backing asset.',
        'This is the same mechanic used by IMF Special Drawing Rights, gold-denominated sovereign bonds, and private bank gold-linked structured notes.',
        'ISO 4217 defines XAU as a valid currency code. The pacs.008 Ccy field accepts XAU natively. No format change to the message is required.',
        'The clearing engine reads the currency code from pacs.008. If XAU, it applies live XAUT spot price from CoinGecko to calculate unit amount. If USD, it issues 1:1.',
        'Example: pacs.008 carries USD 250000. Clearing engine divides by live XAUT price (~$3300/oz) = ~75.75 troy ounces expressed as SFETREAS/PTN/PSCI units in XAU denomination.',
        'All three instruments can hold different denomination references simultaneously. The framework governs which applies at which time.',
        '',
        '=== THE PIPELINE BRIDGES -- DENOMINATION AGNOSTIC ===',
        'pacs.008: Currency-agnostic message format. ISO 4217 XAU is a valid Ccy code. Same message structure, different currency field. Same bridge.',
        'Moov ACH: Processes fiat on the sending side only. Never sees gold. Sender initiates ACH in USD. Gold denomination happens downstream at the clearing engine. Same bridge.',
        'SFTPGo: Transmits the signed manifest. Does not parse content. Authenticates and delivers regardless of denomination. Same bridge.',
        'Fiduciary Clearing Engine: The only layer that changes. Reads currency code, applies XAU conversion if needed, instructs GCHQ on what to issue and in what amount.',
        'One pipeline. All three assets. USD or XAU denomination. No additional infrastructure required.',
        '',
        '=== THE 7-STEP PIPELINE (primary path) ===',
        'Step 1 -- DTI Token: Authorization event. Trust instrument and trigger. Not a traded asset.',
        'Step 2 -- ISO 20022 pacs.008: Credit transfer message. Carries framework reference, asset code, amount, currency (USD or XAU), treasury as beneficiary.',
        'Step 3 -- Moov ACH: Fiat moves between institutions on the sending side. Treasury never participates in the fiat leg.',
        'Step 4 -- SFTPGo: Signed manifest delivered to clearing engine. Authentication layer. No manual communication.',
        'Step 5 -- MoneyGram SEP-6 (or Fiduciary Clearing Engine direct): Receives manifest, matches framework reference, prepares issuance.',
        'Step 6 -- Issuance on Stellar: USDC or trust instrument lands at treasury. One ledger close (~5 seconds). On-chain, verifiable.',
        'Step 7 -- DAO Treasury receives asset: 250,000 units processed = 250,000 USDC or equivalent XAU-denominated trust instrument units.',
        '',
        '=== CRITICAL: FIAT AND THE TREASURY ===',
        'The treasury is a Stellar account. It holds Stellar assets only: XLM, USDC, SFETREAS, SFE2025PTN, SFE2025PSCI.',
        'Fiat never enters the treasury. Fiat moves between institutions on the sending side.',
        'The treasury is the destination of a settlement, not a participant in a fiat transaction.',
        'No bank account on the treasury side. No fiat deposit from the treasury side. The sender deposits fiat. The treasury receives the on-chain asset.',
        '',
        '=== ALTERNATE PATHS (if DTI token not realized) ===',
        'Alt 1: SEP-6 direct deposit -- any SEP-6 anchor receives fiat from sender, issues USDC to treasury.',
        'Alt 2: Moov ACH direct to Circle -- Moov settles to Circle, Circle mints USDC, treasury receives.',
        'Alt 3: SFTPGo manifest reroute -- manifest redirected to any SEP-6 compliant anchor.',
        'Alt 4: CCTP bridge reverse -- USDC on Solana/Ethereum bridged to Stellar via CCTP. MCP Server GBM7 handles this.',
        'Alt 5: Claimable balance -- issuer pre-creates USDC balance locked to treasury. Claimed when condition met.',
        'Alt 6: pathPaymentStrictReceive from XLM reserves -- XLM converts to USDC through AMM atomically.',
        'Alt 7: Pre-signed multisig XDR -- transactions pre-built, signed 2-of-3 offline, submitted when trigger met.',
        '',
        '=== CLOB SETTLEMENT ===',
        'CLOB = Central Limit Order Book. Not speculative trading. Infrastructure.',
        'manageSellOffer places a passive offer on-chain. Stellar protocol settles atomically when matching offer appears. No human trigger. No exchange.',
        'CLOB Watcher monitors for settlement events and triggers downstream actions automatically.'
      ].join('\n');

      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg) {
        let protocol = '';
        protocol += 'IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\n\n';
        protocol += 'TODAY: ' + new Date().toUTCString() + '\n\n';
        protocol += 'LIVE DATA -- retrieved right now from Horizon, CoinGecko, AP News, Reuters, BBC, StellarExpert, MoneyGram TOML, SFE TOML, SearXNG:\n';
        protocol += ctx + '\n';
        protocol += PIPELINE_KNOWLEDGE + '\n\n';
        protocol += 'HOW YOU THINK:\n';
        protocol += 'Identify what is actually being asked. Find the relevant data above. State the answer directly.\n';
        protocol += 'If the live data above answers it -- state it as fact.\n';
        protocol += 'If the live data does not answer it -- say so in one sentence, then give the best reasoning from what you know.\n\n';
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
      return new Response(JSON.stringify({ response: response.response }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch('https://fiduciary-clearing-engine.onrender.com/health').catch(() => {}));
  }
};
