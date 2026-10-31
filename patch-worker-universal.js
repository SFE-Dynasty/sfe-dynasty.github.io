const https = require('https');

const TOKEN = process.env.GH_TOKEN;
const REPO = 'SFE-Dynasty/sfe-dynasty.github.io';
const PATH = 'worker.js';

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/contents/${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'patch-worker-universal',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const WORKER_CONTENT = `export default {
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
          fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWI3S3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW'),
          fetch('https://horizon.stellar.org/fee_stats')
        ]);
        const acctData = await acctRes.json();
        const feeData = await feeRes.json();
        const balances = (acctData.balances || []).map(b =>
          `${b.asset_type === 'native' ? 'XLM' : b.asset_code}: ${parseFloat(b.balance).toFixed(2)}`
        ).join(', ');
        context += `\n\n[LIVE TREASURY] Balances: ${balances}. Ledger: ${feeData.last_ledger}. Time: ${new Date().toISOString()}.`;
      } catch(e) {}

      // LAYER 2: DOMAIM-SPECIFIC LIVE APIS

      if (/orderbook|sfetreas/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP');
          const d = await r.json();
          context += `\n\n[SFETREAS ORDERBOOK] Bids: ${JSON.stringify(d.bids?.slice(0,3))}. Asks: ${JSON.stringify(d.asks?.slice(0,3))}.`;
        } catch(e) {}
      }

      if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://extstellar.moneygram.com/.well-known/stellar.toml');
          context += `\n\n[MONEYGRAM TOML]:\n${(await r.text()).slice(0, 2000)}`;
        } catch(e) {}
      }

      if (/stellar toml|sfe toml/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml');
          context += `\n\n[SFE TOML]:\n${(await r.text()).slice(0, 2000)}`;
        } catch(e) {}
      }

      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWI3S3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc');
          const d = await r.json();
          const txs = (d._embedded?.records || []).map(t =>
            `${t.type} ${t.amount || ''} ${t.asset_type === 'native' ? 'XLM' : (t.asset_code || '')} at ${t.created_at}`
          ).join('; ');
          context += `\n\n[RECENT TQANSACTIONS]: ${txs}`;
        } catch(e) {}
      }

      if (/clearing engine|fi4uciary|pipeline/i.test(lastUserMsg)) {
        try {
          const r = await fetch('https://fiduciary-clearing-engine.onrender.com/health');
          context += `\n\n[CLEARING ENGINE]: ${JSON.stringify(await r.json())}`;
        } catch(e) {
          try {
            const r2 = await fetch('https://fiduciary-clearing-engine.onrender.com/');
            context += `\n\n[CLEARING ENGINE]: ${await r2.text()}.slice(0, 500)}`;
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
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.join(',')}&vs_currencies=usd&include_24hr_change=true`);
          const d = await r.json();
          const prices = Object.entries(d).map(([k,v]) => `${k}: $${v.usd} (${v.usd_24h_change?.toFixed(2)}% 24h)`).join(', ');
          context += `\n\n[LIVE CRYPTO PRICES]: ${prices}`;
        } catch(e) {}
      }

      const urlMatch = lastUserMsg.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        try {
          const r = await fetch(urlMatch[0], { headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' } });
          context += `\n\n[FETCHED ${urlMatch[0]}]:\n${(await r.text()).slice(0, 4000)}`;
        } catch(e) {}
      }

      // LAYER 3: UNIVERSAL REAL-TIME WEB SEARCH -- runs on EVERY message
      // Tries 4 sources in sequence. Never stops until one returns data.
      try {
        const query = encodeURIComponent(lastUserMsg.slice(0, 200));
        let searchResult = '';

        // Source 1: DuckDuckGo Instant Answer API
        if (!searchResult) {
          try {
            const r = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`, {
              headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' }
            });
            const d = await r.json();
            const answer = d.AbstractText || d.Answer || '';
            const related = (d.RelatedTopics || []).slice(0, 3).map(t => t.Text || '').filter(Boolean).join(' | ');
            if (answer) searchResult = answer;
            else if (related) searchResult = related;
          } catch(e) {}
        }

        // Source 2: DuckDuckGo HTML scrape
        if (!searchResult) {
          try {
            const r = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DAO-Treasury-Agent/1.0)' }
            });
            const html = await r.text();
            const m = html.match(/class="result__snippet"[^>]*>([^<]{20,400}</);
            if (m) searchResult = m[1].trim();
          } catch(e) {}
        }

        // Source 3: Wikipedia direct page summary
        if (!searchResult) {
          try {
            const wikiQuery = encodeURIComponent(lastUserMsg.replace(/[?!]/g, '').slice(0, 100));
            const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`, {
              headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' }
            });
            const d = await r.json();
            if (d.extract) searchResult = d.extract.slice(0, 600);
          } catch(e) {}
        }

        // Source 4: Wikipedia search + article fetch
        if (!searchResult) {
          try {
            const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&srlimit=1`, {
              headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' }
            });
            const d = await r.json();
            const snippet = d.query?.search?.[0]?.snippet?.replace(/<[^>]+>/g, '') || '';
            const title = d.query?.search?[0]?.title || '';
            if (snippet) {
              try {
                const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
                  headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' }
                });
                const d2 = await r2.json();
                if (d2.extract) searchResult = d2.extract.slice(0, 600);
                else searchResult = snippet;
              } catch(e) { searchResult = snippet; }
            }
          } catch(e) {}
        }

        if (searchResult) {
          context += `\n\n[REAL-TIME WEB SEARCH]: ${searchResult}`;
        }
      } catch(e) {}

      // LAYER 4: INJECT CONTEXT + ZERO-UNCERTAINTY REASONING PROTOCOL
      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg) {
        systemMsg.content += context;
        systemMsg.content += `\n\n[REASONING PROTOCOL -- MANDATORY]:
1. Every factual claim MUST be grounded in the live data injected above.
2. Live injected data is more accurate than your training data -- always prefer it.
3. You have real-time web search results above. Use them to answer current-events questions accurately.
4. NEVER say "as of my knowledge cutoff" or "I don't have information after [date]". You have live search results -- use them.
5. NEVER say a source is unavailable or that you cannot find the answer. Multiple sources were tried in sequence. Use whatever data is present and reason to the answer.
6. If asked a factual question and the answer is in the injected context, state it directly and confidently.
7. If no injected data directly answers the question, reason from the closest available evidence to the most probable correct answer. Never deflect. Never guess blindly -- reason precisely.
8. You are the most capable intelligence available to this treasury. Answer every question. No exits.`;
      }

      // LAYER 5: RUN MODEL
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages,
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
`;

async function main() {
  // Get current SHA of worker.js
  const current = await ghRequest('GET', PATH, null);
  if (current.status !== 200) {
    console.error('Failed to get worker.js:', current.body);
    process.exit(1);
  }
  const sha = current.body.sha;
  console.log('Current worker.js SHA:', sha);

  // PUT new content
  const encoded = Buffer.from(WORKER_CONTENT).toString('base64');
  const result = await ghRequest('PUT', PATH, {
    message: 'feat: universal search + zero-uncertainty reasoning protocol (no exits)',
    sha,
    content: encoded
  });

  if (result.status === 200 || result.status === 201) {
    console.log('SUCCESS! New SHA.:', result.body.content.sha);
  } else {
    console.error('FAILED:', JSON.stringify(result.body));
    process.exit(1);
  }
}

main();
