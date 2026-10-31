import requests, base64

token = "ghp_lX13WxHGt0FPfdJxBwIJ7HyJM2WcbL4X3qz3"
headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

r = requests.get("https://api.github.com/repos/SFE-Dynasty/sfe-dynasty.github.io/contents/treasury/dashboard.html", headers=headers)
data = r.json()
sha = data["sha"]
html = base64.b64decode(data["content"].replace("\n","")).decode()

# Change 1: persistent memory init
html = html.replace(
    "var aiMsgs=[{role:'system',content:SYS}];",
    "var _stored=localStorage.getItem('dao_ai_history');var aiMsgs=_stored?JSON.parse(_stored):[{role:'system',content:SYS}];(function(){var container=document.getElementById('aiMsgs');if(aiMsgs.length>1){container.innerHTML='';aiMsgs.forEach(function(m){if(m.role==='system')return;var d=document.createElement('div');d.className=m.role==='user'?'mu':'ma';d.textContent=m.content;container.appendChild(d);})}})();"
)

# Change 2: save to localStorage after each message + clear function
html = html.replace(
    "aiMsgs.push({role:'assistant',content:reply});}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}",
    "aiMsgs.push({role:'assistant',content:reply});localStorage.setItem('dao_ai_history',JSON.stringify(aiMsgs));}catch(e){thinking.className='ma';thinking.textContent='Error: '+e.message;}}function clearAIHistory({}aiMsgs=[{role:'system',content:SYS}];localStorage.removeItem('dao_ai_history');var c=document.getElementById('aiMsgs');c.innerHTML='<div class=\"ma\">Memory cleared. Hello! I am your DAO Treasury AI.</div>';}"
)

# Change 3: Clear button + model name fix
html = html.replace(
    'Llama 3.1 8B</span></span><button class="bs" onclick="document.getElementById(\'aiPanel\').classList.remove(\'open\')">&#10005;</button></div>',
    'Llama 3.3 70B</span></span><div style="display:flex;gap:5px"><button class="bs" onclick="clearAIHistory()" title="Clear memory">&#128465;</button><button class="bs" onclick="document.getElementById(\'aiPanel\').classList.remove(\'open\')">&#10005;</button></div></div>'
)

encoded = base64.b64encode(html.encode()).decode()
payload = {"message":"feat: add persistent AI chat memory (localStorage)", "content": encoded, "sha": sha}
resp = requests.put("https://api.github.com/repos/SFE-Dynasty/sfe-dynasty.github.io/contents/treasury/dashboard.html", headers=headers, json=payload)
print(resp.status_code, resp.json().get("commit", {}).get("sha", "ERROR: "+str(resp.text)[:200]))
