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

function rep(str, find, replace) {
  return str.split(find).join(replace);
}

function main() {
  ghRequest('GET', 'treasury/dashboard.html', null).then(function(r) {
    if (r.status !== 200) { console.error('Failed to get dashboard.html:', r.status); process.exit(1); }
    var sha = r.body.sha;
    var html = Buffer.from(r.body.content.replace(/\n/g, ''), 'base64').toString('utf8');
    console.log('Got dashboard.html, length:', html.length, 'SHA:', sha);

    // 1. User message bubble — larger font, better padding
    html = rep(html,
      '.mu{align-self:flex-end;background:#d4af3722;border:1px solid #d4af3744;color:#e0e0e0;padding:5px 9px;border-radius:6px;max-width:85%;font-size:10px;word-break:break-word}',
      '.mu{align-self:flex-end;background:#d4af3722;border:1px solid #d4af3744;color:#e0e0e0;padding:10px 14px;border-radius:10px 10px 2px 10px;max-width:85%;font-size:13px;line-height:1.6;word-break:break-word}'
    );

    // 2. Assistant message bubble — larger font, pre-wrap for newlines
    html = rep(html,
      '.ma{align-self:flex-start;background:#1a1a1a;border:1px solid #333;color:#e0e0e0;padding:5px 9px;border-radius:6px;max-width:85%;font-size:10px;word-break:break-word}',
      '.ma{align-self:flex-start;background:#1a1a1a;border:1px solid #2a2a2a;color:#e0e0e0;padding:10px 14px;border-radius:10px 10px 10px 2px;max-width:90%;font-size:13px;line-height:1.7;word-break:break-word;white-space:pre-wrap}'
    );

    // 3. Thinking indicator
    html = rep(html,
      '.mt{color:#666;font-style:italic;font-size:9px;align-self:flex-start}',
      '.mt{color:#666;font-style:italic;font-size:12px;align-self:flex-start;padding:6px 10px}'
    );

    // 4. AI panel — taller and wider
    html = rep(html,
      '#aiPanel{position:fixed;bottom:60px;left:20px;width:340px;height:460px;background:#0d0d0d;border:1px solid #d4af37;border-radius:8px;z-index:10000;display:none;flex-direction:column;overflow:hidden}',
      '#aiPanel{position:fixed;bottom:60px;left:20px;width:380px;height:520px;background:#0d0d0d;border:1px solid #d4af37;border-radius:10px;z-index:10000;display:none;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.6)}'
    );

    // 5. Replace textContent with innerHTML for formatted rendering
    html = rep(html,
      "thinking.className='ma';thinking.textContent=reply;",
      "thinking.className='ma';thinking.innerHTML=reply.split('\\n\\n').join('<br><br>').split('\\n').join('<br>');"
    );

    // 6. Fix history restore to also use innerHTML
    html = rep(html,
      'd.textContent=m.content;',
      "d.innerHTML=m.content.split('\\n\\n').join('<br><br>').split('\\n').join('<br>');"
    );

    console.log('All replacements done. Pushing...');

    return ghRequest('PUT', 'treasury/dashboard.html', {
      message: 'fix: chat formatting — larger text, paragraph spacing, line breaks',
      sha: sha,
      content: Buffer.from(html).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) {
      console.error('PUT failed:', r.status, JSON.stringify(r.body).slice(0, 200));
      process.exit(1);
    }
    console.log('SUCCESS. New SHA:', r.body.content.sha);
  }).catch(function(err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

main();
