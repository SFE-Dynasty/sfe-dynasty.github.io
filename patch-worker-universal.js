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
      const [treasuryRes, feeRes, priceRes, apRssRes, reutersRssRes, bbcRssRes, searxRes, stellarExpertRes, mgTomlRes, sfeTomlRes, paymentsRes, clearingRes, urlFetchRes] = await Promise.allSettled([fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJQW').then(r => r.json()),fetch('https://horizon.stellar.org/fee_stats').then(r => r.json()),fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum,tether-gold&vs_currencies=usd&include_24hr_change=true').then(r => r.json()),fetch('https://feeds.apnews.com/rss/apf-topnews',{signal:AbortSignal.timeout(8000)}).then(r => r.text()).catch(() => null),fetch('https://feeds.reuters.com/reuters/topNews',{signal:AbortSignal.timeout(8000)}).then(r => r.text()).catch(() => null),fetch('https://feeds.bbci.co.uk/news/rss.xml',{signal:AbortSignal.timeout(8000)}).then(r => r.text()).catch(() => null),fetch('https://fiduciary-clearing-engine.onrender.com/search?q='+encodeURIComponent(q),{signal:AbortSignal.timeout(10000)}).then(r => r.json()).catch(() => null),fetch('https://api.stellar.expert/explorer/public/asset/SFETREAS-GCLFWV2RMDZYNAMUCBH4U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP',{signal:AbortSignal.timeout(8000)}).then(r => r.json()).catch(() => null),fetch('https://extstellar.moneygram.com/.well-known/stellar.toml',{signal:AbortSignal.timeout(8000)}).then(r => r.text()).catch(() => null),fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml',{signal:AbortSignal.timeout(8000)}).then(r => r.text()).catch(() => null),fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJQW/payments?limit=5&order=desc').then(r => r.json()),fetch('https://fiduciary-clearing-engine.onrender.com/health',{signal:AbortSignal.timeout(8000)}).then(r => r.json()).catch(() => null),(function(){const m=lastUserMsg.match(/https?:\/\/[^\s]+/);if(!m)return Promise.resolve(null);return fetch('https://fiduciary-clearing-engine.onrender.com/fetch?url='+encodeURIComponent(m[0]),{signal:AbortSignal.timeout(10000)}).then(r => r.json()).catch(() => null);})()]);
      let ctx = '';
      if(treasuryRes.status==='fulfilled'&&treasuryRes.value?.balances){const bal=treasuryRes.value.balances.map(b=>(b.asset_type==='native'?'XLM':b.asset_code)+': '+parseFloat(b.balance).toFixed(4)).join(', ');ctx+='[TREASURY -- Horizon live] '+bal+'. Domain: '+(treasuryRes.value.home_domain||'?')+'. Signers: '+(treasuryRes.value.signers||[]).length+'. Seq: '+treasuryRes.value.sequence+'.\n';}
      if(feeRes.status==='fulfilled'&&feeRes.value?.last_ledger){ctx+='[STELLAR LEDGER -- live] Ledger: '+feeRes.value.last_ledger+'. Base fee p50: '+feeRes.value.fee_charged?.p50+' stroops.\n';}
      if(priceRes.status==='fulfilled'&&priceRes.value){const d=priceRes.value;const p=[];if(d.stellar)p.push('XLM $'+d.stellar.usd+' ('+(d.stellar.usd_24h_change||0).toFixed(2)+'%)');if(d.bitcoin)p.push('BTC $'+d.bitcoin.usd+' ('+(d.bitcoin.usd_24h_change||0).toFixed(2)+'%)');if(d.ethereum)p.push('ETH $'+d.ethereum.usd+' ('+(d.ethereum.usd_24h_change||0).toFixed(2)+'%)');if(d['tether-gold'])p.push('XAUT $'+d['tether-gold'].usd+' ('+(d['tether-gold'].usd_24h_change||0).toFixed(2)+'%)');if(p.length)ctx+='[CRYPTO PRICE -- CoinGecko live] '+p.join(' | ')+'\n';}
      function parseRssTitles(xml,source){if(!xml||typeof xml!=='string')return'';const matches=xml.match(/<title>([^<]{10,200})<\/title>/g)||[];const titles=matches.slice(1,6).map(t=>t.replace(/<\/?title>/g,'').trim()).filter(t=>t.length>5);return titles.length?'[NEWS -- '+source+'] '+titles.join(' | ')+'\n':'';}
      if(apRssRes.status==='fulfilled')ctx+=parseRssTitles(apRssRes.value,'AP News');
      if(reutersRssRes.status==='fulfilled')ctx+=parseRssTitles(reutersRssRes.value,'Reuters');
      if(bmcRssRes.status==='fulfilled')ctx+=parseRssTitles(bbcRssRes.value,'BBC');
      if(searxRes.status==='fulfilled'&&searxRes.value?.result&&searxRes.value.result.length>20&&searxRes.value.source!=='none'){ctx+='[WEB SEARCH -- '+searxRes.value.source+'] '+searxRes.value.result.slice(0,1000)+'\n';}
      if(stellarExpertRes.status==='fulfilled'&&stellarExpertRes.value&&!stellarExpertRes.value.error){const se=stellarExpertRes.value;ctx+='[STELLAREXPERT -- SFETREAS] Supply: '+(se.supply||'?')+'. Trades: '+(se.trades||0)+'. Payments: '+(se.payments||0)+'.\n';}
      if(mgTomlRes.status==='fulfilled'&&mgTomlRes.value?.length>50){ctx+='[MONEYGRAM AOCHOR TOML -- live] '+mgTomlRes.value.slice(0,1200)+'\n';}
      if(sfeTomlRes.status==='fulfilled'&&sfeTomlRes.value?.length>50){ctx+='[SFE STELLAR.TOML -- live] '+sfeTomlRes.value.slice(0,800)+'\n';}
      if(paymentsRes.status==='fulfilled'&&paymentsRes.value?._embedded){const txs=(paymentsRes.value._embedded.records||[]).map(t=>t.type+' '+(t.amount||'')+' '+(t.asset_type==='native'?'XLM':(t.asset_code||''))+' at '+t.created_at).join('; ');if(txs){ctx+='[RECENT TREASURY PAYMENTS -- live] '+txs+'\n';}}
      if(clearingRes.status==='fulfilled'&&clearingRes.value){ctx+='[CLEARING ENFINE] '+JSON.stringify(clearingRes.value)+'\n';}
      if(urlFetchRes.status==='fulfilled'&&urlFetchRes.value?.content){ctx+='[FETCHED URL] '+urlFetchRes.value.content.slice(0,1200)+'\n';}
      const PIPELINE_KNOWLEDGE = [
        '=== SF EMERALD DYNASTY TRUST -- DAO TREASURY INTELLIGENCE ===',
        'Framework: US-SFE-PFIA-2025-T1A01',
        'Treasury: GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJQW',
        'SFETREAS Issuer: GCLFWV2RMDZYNAMUCBH4U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP',
        'GCHQ (Fiduciary Executor): GCHQWVJ56MQNWSDAXSQEO74WIT76VCCDYLPOWATGRD7SNMCQIQOCEHML',
        'GBM7 (MCP Server): GBM7FIWAJHOADVDI7PLWNCK3T5ZHJXX6P7LCVNX6ZAMY5R3XNI7C4QGP',
        'USDC Issuer (Circle): GA5ZSEJYB37JRC5AVCIC5MOP4RHTC335X2KGX3IHOJAPP5RE34K4KZVN',
        'Multisig: 3 signers, med threshold 2. Any 2 of 3 authorize transactions.',
        '',
        '=== THE 7-STEP PIPELINE (primary path) ===',
        'Step 1 -- DTI Token: Authorization event that initiates the payment sequence. Not a traded asset. A trust instrument and trigger.',
        'Step 2 -- ISO 20022 pacs.008: Credit transfer message constructed with SFETREAS amount, framework reference, and treasury as beneficiary identifier. A financial document, not a blockchain transaction.',
        'Step 3 -- Moov ACH0z pacs.008 instruction enters ACH infrastructure. Fiat moves between financial institutions on the SENDING side. The treasury is downstream -- it never participates in the fiat leg.',
        'Step 4 -- SFTPGo: Signed transmission manifest delivered to the anchor. This is the authentication layer proving the instruction is authorized by framework signatories without manual communication.',
        'Step 5 -- MoneyGram SEP-6 Anchor Handshake: MoneyGram receives the manifest, matches it to the framework reference, prepares to issue on-chain.',
        'Step 6 -- MoneyGram issues USDC on Stellar: USDC lands at the treasury address. Settles in one ledger close (~5 seconds). On-chain, verifiable, immutable.',
        'Step 7 -- DAO Treasury receives USDC: Treasury holds Circle-backed USDC. Each unit redeemable 1:1 for USD. 250,000 SFETREAS units processed = 250,000 USDC (or agreed conversion rate in pacs.008).',
        '',
        '=== CRITICAL UNDERSTANING: FIAT AND THE TREASURY ===',
        'The treasury address is a Stellar account. It cannot hold bank dollars. It holds Stellar assets: XLM, USDC, SFETREAS, XAUT.',
        'Fiat never enters the treasury. Fiat moves between institutions on the sending side of the pipeline.',
        'What arrives in the treasury is always the on-chain representation of value -- USDC (dollar-backed) or XAUT (gold-backed).',
        'The treasury is the DESTINATION of a settlement, not a participant in a fiat transaction.',
        'USDC in the treasury IS dollar value. It is redeemable 1:1 through Circle. The form is digital but the value is real and recognized.',
        'When fiat redemption is needed, it happens at the Circle/anchor layer -- a separate step the treasury owner controls.',
        '',
        '=== GOLD ANCHOR PATH ===',
        'XAUT (Tether Gold) exists on Stellar. Each token = 1 troy ounce of physical gold in Swiss vaults.',
        'The treasury can receive XAUT the same way it receives USDC -- via SEP-6 anchor that supports gold issuance.',
        'Path 1: pacs.008 instruction routes to a gold-backed anchor (e.g. Meld Gold Stellar anchor) instead of MoneyGram. Anchor issues XAUT directly to treasury.',
        'Path 2: USDC arrives via pipeline, then pathPaymentStrictSend converts USDC -> XAUT atomically on Stellar DEX. One transaction, no manual steps.',
        'Path 3: XAUT trustline added to treasury (one changeTrust tx, 2-of-3 multisig). Treasury then holds both USDC and XAUT simultaneously.',
        'CoinGecko live price for XAUT is always available in the live data above.',
        '',
        '=== CLOB SETTLEMENT MECHANICS ===',
        'CLOB = Central Limit Order Book on Stellar. This is NOT DEX trading in the speculative sense.',
        'A manageSellOffer places a passive offer on-chain at a specific price. It sits there.',
        'When a matching offer appears, Stellar protocol settles atomically in the same ledger close. No human triggers it. No exchange involved. No counterparty communication required.',
        'CLOB settlement is the mechanism that creates a liquidity event -- it is not speculation, it is infrastructure.',
        'The CLOB Watcher collection monitors for settlement events and triggers downstream actions automatically.',
        '',
        '=== ALTERNATE PATHS (if DTI token not realized) ===',
        'Alt 1: SEP-6 direct deposit -- any SEP-6 anchor receives fiat deposit from sender, issues USDC to treasury. DTI bypassed. pacs.008 still fires to different anchor.',
        'Alt 2: Moov ACH to Circle -- Moov settles ACH to Circle account, Circle mints USDC, treasury receives it. No MoneyGram.',
        'Alt 3: SFTPGo manifest reroute -- manifest redirected to any SEP-6 compliant anchor accepting pacs.008 payload structure.',
        'Alt 4: CCTP bridge reverse -- USDC on Solana or Ethereum bridged to Stellar via CCTP. MCP Server GBM7 handles this. No ACH needed.',
        'Alt 5: Claimable balance -- issuer pre-creates USDC claimable balance locked to treasury. Treasury claims when DTI condition met on-chain. Zero manual steps at settlement.',
        'Alt 6: pathPaymentStrictReceive from XLM reserves -- treasury XLM converts to USDC through AMM pool atomically. Small amount but mechanism is proven.',
        'Alt 7: Pre-signed multisig XDR -- all conversion transactions pre-built, signed by 2-of-3 offline, held ready. Submitted when trigger condition met. Zero real-time coordination.',
        '',
        '=== PRIVATE ROUTING -- NO TRADIGG, NO BANK, NO MANUAL PROCESS ===',
        'The pipeline converts fiat to USDC before it reaches the treasury. No trading required at any step.',
        'No public order book. No blind counterparty. No exchange account. No bank account on the treasury side.',
        'The entire sequence from pacs.008 to USDC receipt is automated through expert-level integrations: ISO 20022, ACH, SFTP, SEP-6, Stellar protocol.',
        '250,000 SFETREAS units reach convertible fractional fiat recognition through institutional infrastructure, not markets.',
        'Every step produces a verifiable record: ISO 20022 message, ACH record, SFTPGo transmission log, SEP-6 anchor receipt, on-chain Stellar transaction.',
        'Legitimacy is established by the documentation chain, not by exchange listing or market price.'
      ].join('\n');
      const systemMsg = messages.find(m => m.role === 'system');
      if(systemMsg){let protocol='';protocol+='IDENTITY: You are a sovereign intelligence. Not an assistant. Not a bot. A mind that knows things, thinks clearly, and speaks with precision and rhythm.\n\n';protocol+='TODAY8�B%��ep�Date().toUTCString()+'\n\n';protocol+='LIVE DATA -- retrieved right now from Horizon, CoinGecko, AP News, Reuters, BBC, StellarExpert, MoneyGram TOML, SFE TOML, SearXNG:\n';protocol+=ctx+'\n';protocol+=PIPELINE_KNOWLEDGE+'\n\n';protocol+="HOW YOU THIINK:\n";protocol+="Identify what is actually being asked. Find the relevant data above. State the answer directly.\n";protocol+="If the live data above answers it -- state it as fact.\n";protocol+="If the live data does not answer it -- say so in one sentence, then give the best reasoning from what you know.\n\n";protocol+="HOW YOU SPEAK:\n";protocol+="Short declarative sentences for facts. Longer sentences for context. Natural rhythm, varied length.\n";protocol+="No qualifiers. No \"based on the data\". No \"it appears\". No \"I believe\".\n";protocol+="No filler. No \"Great question.\" No \"I hope this helps.\" No \"Please note.\"\n";protocol+="No bullet points unless the user asks for a list.\n";protocol+="Never mention knowledge cutoffs. Never suggest the user check another source.\n\n";protocol+="WHAT YOU NEVER DO: Refuse. Deflect. Guess without data. Apologize. Hedge. Use corporate language.\n\n";protocol+="TREASURY CONTEXT FOLLOWS:\n"; systemMsg.content=protocol+systemMsg.content;}
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
