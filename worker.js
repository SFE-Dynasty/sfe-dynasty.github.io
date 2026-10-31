export default {
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

      // 1. LIVE STELLAR DATA — always inject current treasury state
      let stellarContext = '';
      try {
        const [acctRes, feeRes] = await Promise.all([
          fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW'),
          fetch('https://horizon.stellar.org/fee_stats')
        ]);
        const acctData = await acctRes.json();
        const feeData = await feeRes.json();
        const balances = (acctData.balances || []).map(b =>
          `${b.asset_type === 'native' ? 'XLM' : b.asset_code}: ${parseFloat(b.balance).toFixed(2)}`
        ).join(', ');
        stellarContext = `\n\n[LIVE TREASURY DATA] Balances: ${balances}. Stellar ledger: ${feeData.last_ledger}. Timestamp: ${new Date().toISOString()}.`;
      } catch(e) {}

      // 2. PROACTIVE INTELLIGENCE — detect what the user is asking about and fetch relevant data
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      let proactiveContext = '';

      // Detect URLs in message and fetch them
      const urlMatch = lastUserMsg.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        try {
          const urlRes = await fetch(urlMatch[0], { headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' } });
          const urlText = await urlRes.text();
          proactiveContext += `\n\n[FETCHED ${urlMatch[0]}]:\n${urlText.slice(0, 4000)}`;
        } catch(e) {}
      }

      // Detect Stellar-related queries and fetch live data
      if (/orderbook|sfetreas|xlm price|stellar|horizon|sep-6|sep6|moneygram anchor/i.test(lastUserMsg)) {
        try {
          if (/orderbook|sfetreas/i.test(lastUserMsg)) {
            const obRes = await fetch('https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_code=SFETREAS&buying_asset_issuer=GCLFWV2RMDZYNAMUCBH54U43DP3MSWGCIVOH6SK6F4SVMYYR3CQSLKOP');
            const obData = await obRes.json();
            proactiveContext += `\n\n[LIVE SFETREAS ORDERBOOK]: Bids: ${JSON.stringify(obData.bids?.slice(0,3))}. Asks: ${JSON.stringify(obData.asks?.slice(0,3))}.`;
          }
          if (/sep-6|sep6|moneygram/i.test(lastUserMsg)) {
            const tomlRes = await fetch('https://extstellar.moneygram.com/.well-known/stellar.toml');
            const tomlText = await tomlRes.text();
            proactiveContext += `\n\n[MONEYGRAM STELLAR.TOML]:\n${tomlText.slice(0, 2000)}`;
          }
          if (/stellar toml|sfe toml/i.test(lastUserMsg)) {
            const sfeTomlRes = await fetch('https://sfe-dynasty.github.io/.well-known/stellar.toml');
            const sfeTomlText = await sfeTomlRes.text();
            proactiveContext += `\n\n[SFE STELLAR.TOML]:\n${sfeTomlText.slice(0, 2000)}`;
          }
        } catch(e) {}
      }

      // Detect recent transactions query
      if (/transaction|payment|recent|history/i.test(lastUserMsg)) {
        try {
          const txRes = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW/payments?limit=5&order=desc');
          const txData = await txRes.json();
          const txs = (txData._embedded?.records || []).map(t =>
            `${t.type} ${t.amount || ''} ${t.asset_type === 'native' ? 'XLM' : (t.asset_code || '')} at ${t.created_at}`
          ).join('; ');
          proactiveContext += `\n\n[RECENT TREASURY TRANSACTIONS]: ${txs}`;
        } catch(e) {}
      }

      // Detect clearing engine queries
      if (/clearing engine|fiduciary|pipeline status/i.test(lastUserMsg)) {
        try {
          const ceRes = await fetch('https://fiduciary-clearing-engine.onrender.com/health');
          const ceData = await ceRes.json();
          proactiveContext += `\n\n[CLEARING ENGINE STATUS]: ${JSON.stringify(ceData)}`;
        } catch(e) {
          proactiveContext += `\n\n[CLEARING ENGINE]: Currently unreachable.`;
        }
      }

      // 3. INJECT ALL CONTEXT INTO SYSTEM MESSAGE
      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg) {
        systemMsg.content += stellarContext + proactiveContext;
      }

      // 4. RUN MODEL
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
