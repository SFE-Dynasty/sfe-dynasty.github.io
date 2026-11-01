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

function main() {
  ghRequest('GET', 'treasury/dashboard.html', null).then(function(r) {
    if (r.status !== 200) { console.error('Failed to get dashboard.html'); process.exit(1); }
    var sha = r.body.sha;
    var html = Buffer.from(r.body.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 1. Fix .mu (user message bubble) -- larger font, better padding, line-height
    html = html.replace(
      /\.mu\{/[^}]*\}/,
      '.mu{align-self:flex-end;background:#d4af3722;border:1px solid #d4af3744;color:#e0e0e0;padding:10px 14px;border-radius:10px 10px 2px 10px;max-width:85%;font-size:13px;line-height:1.6;word-break:break-word}'
    );

    // 2. Fix .ma (assistant message bubble) -- larger font, better padding, line-height
    html = html.replace(
      /\.ma\{[^}]*\}/,
      '.ma{align-self:flex-start;background:#1a1a1a;border:1px solid #2a2a2a;color:#e0e0e0;padding:10px 14px;border-radius:10px 10px 10px 2px;max-width:90%;font-size:13px;line-height:1.7;word-break:break-word;white-space:pre-wrap}'
    );

    // 3. Fix .mt (thinking indicator)
    html = html.replace(
      /\.mt\{[^}]*\}/,
      '.mt{color:#666;font-style:italic;font-size:12px;align-self:flex-start;padding:6px 10px}'
    );

    // 4. Make aiPanel taller and wider
    html = html.replace(
      /#aiPanel\{/[^}]*\}/,
      '#aiPanel{position:fixed;bottom:60px;left:20px;width:380px;height:520px;background:#0d0d0d;border:1px solid #d4af37;border-radius:10px;z-index:10000;display:none;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.6)}'
    );

    // 5. Replace textContent assignment with innerHTML markdown renderer
    html = html.replace(
      'thinking.textContent=reply;',
      'thinking.innerHTML=formatMsg(reply);'
    );

    // 6. Also fix the history restore to use innerHTML
    html = html.replace(
      /d\.textContent=m\.content;/g,
      'd.innerHTML=formatMsg(m.content);'
    );

    // 7. Inject formatMsg function before the sendAI function
    var formatFn = 'function formatMsg(t){' +
      'if(!t)return "";' +
      't=t.replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>");' +
      't=t.replace(/\\*([^*]+)\\*/g,"<em>$1</em>");' +
      't=t.replace(/(^|\\n)(\\d+\\.\\s)/g,"$1<br><span style=\\"color:#d4af37;font-weight:bold\\">$2</span>");' +
      't=t.replace(/(^|\\n)([\\-\\*]\\s)/g,"$1<br><span style=\\"color:#d4af37\\">• </span>");' +
      't=t.replace(/\\n\\n/g,"<br><br>");' +
      't=t.replace(/\\n/g,"<br>");' +
      't=t.replace(/<strong>([^<]+):<\/strong>/g,"<strong style=\\"color:#d4af37\\">$1:</strong>");' +
      'return t;' +
    '}';

    html = html.replace(
      'async function sendAI(',
      formatFn + 'async function sendAI('
    );

    return ghRequest('PUT', 'treasury/dashboard.html', {
      message: 'fix: chat formatting \u2014 paragraph spacing, markdown rendering, larger text',
      sha: sha,
      content: Buffer.from(html).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) { console.error('dashboard.html PUT failed:', JSON.stringify(r.body)); process.exit(1); }
    console.log('dashboard.html updated:', r.body.content.sha);
    console.log('ALL DONE.');
  }).catch(function(err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

main();
