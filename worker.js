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

      // 1. LIVE STELLAR DATA — inject current treasury state
      let stellarContext = '';
      try {
        const horizonRes = await fetch('https://horizon.stellar.org/accounts/GCATMWLZ7EU7EUWJ3LS6SBHKILWEUS3QBALHGF3XH4IZCOPJHFB5DJYW');
        const horizonData = await horizonRes.json();
        const balances = (horizonData.balances || []).map(b =>
          `${b.asset_type === 'native' ? 'XLM' : b.asset_code}: ${parseFloat(b.balance).toFixed(2)}`
        ).join(', ');
        const feeRes = await fetch('https://horizon.stellar.org/fee_stats');
        const feeData = await feeRes.json();
        stellarContext = `\n\nLIVE TREASURY DATA (as of this moment): Balances: ${balances}. Current Stellar ledger: ${feeData.last_ledger}.`;
      } catch(e) {
        stellarContext = '';
      }

      // 2. URL FETCHER — if user asks to read a URL, fetch it
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      let urlContext = '';
      const urlMatch = lastUserMsg.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        try {
          const urlRes = await fetch(urlMatch[0], {
            headers: { 'User-Agent': 'DAO-Treasury-Agent/1.0' }
          });
          const urlText = await urlRes.text();
          // Truncate to 3000 chars to stay within context
          urlContext = `\n\nCONTENT FROM ${urlMatch[0]}:\n${urlText.slice(0, 3000)}`;
        } catch(e) {
          urlContext = `\n\nCould not fetch ${urlMatch[0]}: ${e.message}`;
        }
      }

      // 3. BUILD ENHANCED SYSTEM PROMPT
      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg) {
        systemMsg.content += stellarContext + urlContext;
      }

      // 4. RUN MODEL
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages,
        stream: false,
        max_tokens: 1024,
      });

      return new Response(JSON.stringify({
        response: response.response
      }), {
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
