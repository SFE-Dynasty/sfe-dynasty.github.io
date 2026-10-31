const https = require('https');
const TOKEN = process.env.GH_TOKEN;
const REPO = 'SFE-Dynasty/sfe-dynasty.github.io';
const FILE = 'treasury/dashboard.html';

function api(method, apipath, body, accept) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: 'api.github.com',
      path: apipath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': accept || 'application/vnd.github+json',
        'User-Agent': 'patch-script',
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }
    };
    var bufs = [];
    var req = https.request(opts, function(r) {
      r.on('data', function(c) { bufs.push(Buffer.from(c)); });
      r.on('end', function() {
        try { resolve(JSON.parse(Buffer.concat(bufs).toString('utf8'))); }
        catch(e) { reject(new Error('JSON parse failed: ' + Buffer.concat(bufs).toString('utf8').slice(0,200))); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Step 1: get file SHA from contents endpoint
api('GET', '/repos/' + REPO + '/contents/' + FILE)
  .then(function(meta) {
    console.log('meta keys:', Object.keys(meta).join(','));
    var fileSha = meta.sha;
    console.log('fileSha:', fileSha);
    // Step 2: get full content from git/blobs using the file's blob SHA
    return api('GET', '/repos/' + REPO + '/git/blobs/' + fileSha, null, 'application/vnd.github+json')
      .then(function(blob) {
        console.log('blob keys:', Object.keys(blob).join(','));
        var html = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8');
        console.log('html length:', html.length);

        var c1 = html.indexOf("var aiMsgs=[{role:'system',content:SYS}];");
        var c2 = html.indexOf("aiMsgs.push({role:'assistant',content:reply});}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}");
        var c3 = html.indexOf('Llama 3.1 8B</span></span>');
        console.log('change1 pos:', c1, 'change2 pos:', c2, 'change3 pos:', c3);

        html = html.replace(
          "var aiMsgs=[{role:'system',content:SYS}];",
          "var _stored=localStorage.getItem('dao_ai_history');var aiMsgs=_stored?JSON.parse(_stored):[{role:'system',content:SYS}];(function(){var container=document.getElementById('aiMsgs');if(aiMsgs.length>1){container.innerHTML='';aiMsgs.forEach(function(m){if(m.role==='system')return;var d=document.createElement('div');d.className=m.role==='user'?'mu':'ma';d.textContent=m.content;container.appendChild(d);})}})();"
        );

        html = html.replace(
          "aiMsgs.push({role:'assistant',content:reply});}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}",
          "aiMsgs.push({role:'assistant',content:reply});localStorage.setItem('dao_ai_history',JSON.stringify(aiMsgs));}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}function clearAIHistory(){aiMsgs=[{role:'system',content:SYS}];localStorage.removeItem('dao_ai_history');var c=document.getElementById('aiMsgs');c.innerHTML='<div class=\"ma\">Memory cleared. Hello! I am your DAO Treasury AI.</div>';}"
        );

        html = html.replace(
          'Llama 3.1 8B</span></span><button class="bs" onclick="document.getElementById(\'aiPanel\').classList.remove(\'open\')">&#10005;</button></div>',
          'Llama 3.3 70B</span></span><div style="display:flex;gap:5px"><button class="bs" onclick="clearAIHistory()" title="Clear memory">&#128465;</button><button class="bs" onclick="document.getElementById(\'aiPanel\').classList.remove(\'open\')">&#10005;</button></div></div>'
        );

        var encoded = Buffer.from(html).toString('base64');
        return api('PUT', '/repos/' + REPO + '/contents/' + FILE, {
          message: 'feat: add persistent AI chat memory (localStorage)',
          content: encoded,
          sha: fileSha
        });
      });
  })
  .then(function(result) {
    console.log('DONE:', result.commit ? result.commit.sha : JSON.stringify(result).slice(0,200));
  })
  .catch(function(err) {
    console.error('ERROR:', err.message || err);
    process.exit(1);
  });
