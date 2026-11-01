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
  ghRequest('GET', 'patch-worker-universal.js', null).then(function(current) {
    if (current.status !== 200) { console.error('GET failed:', current.status); process.exit(1); }
    const sha = current.body.sha;
    console.log('Current SHA:', sha);
    return ghRequest('PUT', 'patch-worker-universal.js', {
      message: 'feat: inject full pipeline intelligence -- CLOB settlement, fiat clarification, gold anchor path, 7-step routing knowledge',
      sha: sha,
      content: Buffer.from(W).toString('base64')
    });
  }).then(function(r) {
    if (r.status !== 200 && r.status !== 201) {
      console.error('PUT failed:', r.status, JSON.stringify(r.body).slice(0, 300));
      process.exit(1);
    }
    console.log('Updated. New SHA:', r.body.content?.sha);
    console.log('DONE.');
  }).catch(function(err) { console.error('ERROR:', err.message); process.exit(1); });
}

main();