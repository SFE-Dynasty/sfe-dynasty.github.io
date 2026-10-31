const https = require('https');
const token = process.env.GH_TOKEN;
const repo = 'SFE-Dynasty/sfe-dynasty.github.io';
const path = 'treasury/dashboard.html';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'patch-script',
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const req = https.request(opts, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(function main() {
  api(GET, `/repos/${repo}/contents/${path}`)
    .then(data => {
      const sha = data.sha;
      let html = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');

      // Change 1: persistent memory init
      const old1 = `var aiMsgs=[{role:'system',content:SYS}];`;
      const new1 = `var _stored=localStorage.getItem('dao_ai_history');var aiMsgs=_stored?JSON.parse(_stored):[{role:'system',content:SYS}];(function(){var container=document.getElementById('aiMsgs');if(aiMsgs.length>1){container.innerHTML='';aiMsgs.forEach(function(m){if(m.role==='system')return;var d=document.createElement('div');d.className=m.role==='user'?'mu':'ma';d.textContent=m.content;container.appendChild(d);})}})();`;
      html = html.replace(old1, new1);

      // Change 2: save to localStorage + clear function
      const old2 = `aiMsgs.push({role:'assistant',content:reply});}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}`;
      const new2 = `aiMsgs.push({role:'assistant',content:reply});localStorage.setItem('dao_ai_history',JSON.stringify(aiMsgs));}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}function clearAIHistory({}aiMsgs=[{role:'system',content:SYS}];localStorage.removeItem('dao_ai_history');var c=document.getElementById('aiMsgs');c.innerHTML='<div class=\"ma\">Memory cleared. Hello! I am your DAO Treasury AI.</div>';}`;
      html = html.replace(old2, new2);

      // Change 3: Clear button + model name
      const old3 = `Llama 3.1 8B</span></span><button class="bs" onclick="document.getElementById('aiPanel').classList.remove('open')">&#10005;</button></div>`;
      const new3 = `Llama 3.3 70B</span></span><div style="display:flex;gap:5px"><button class="bs" onclick="clearAIHistory()" title="Clear memory">&#128465;</button><button class="bs" onclick="document.getElementById('aiPanel').classList.remove('open')">&#10005;</button></div></div>`;
      html = html.replace(old3, new3);

      const encoded = Buffer.from(html).toString('base64');
      return api(PUT, `/repos/${repo}/contents/${path}`, {
        message: 'feat: add persistent AI chat memory (localStorage)',
        content: encoded,
        sha
      });
    })
    .then(result => {
      console.log('DONE:', result.commit?.sha || JSON.stringify(result).slice(0,200));
    })
    .catch(err => {
      console.error('ERROR:', err);
      process.exit(1);
    });
})();