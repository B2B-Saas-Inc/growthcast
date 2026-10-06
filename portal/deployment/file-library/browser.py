"""Actual local HTTPS browser -> portal -> API -> private database/storage checks."""
import json,sys,subprocess,time,os
from pathlib import Path
R=Path(__file__).resolve().parent
project=sys.argv[1]
compose=['docker','compose','-p',project,'-f',str(R.parent/'runtime/test/compose.yaml'),'-f',str(R.parent/'runtime/test/atrium.compose.yaml'),'-f',str(R/'integration.compose.yaml'),'-f',str(R/'browser.compose.yaml')]
def ab(*args):
 p=subprocess.run(compose+['exec','-T','browser','agent-browser','--ignore-https-errors',*args],text=True,capture_output=True)
 assert p.returncode==0,p.stderr[:500]
 return p.stdout

def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(75):
  if evaluate(js):return
  time.sleep(.3)
 raise AssertionError('Browser condition timed out: '+js[:140])
def open_page(path):ab('open','https://portal.growthcast.invalid'+path)
def login():
 open_page('/login');wait('!!document.querySelector("#email")');ab('fill','#email','invited@growthcast.invalid');ab('fill','#password','synthetic-password-1234');ab('click','button[type=submit]');wait('!location.pathname.includes("login")')
checks=[]
ab('set','viewport','1440','1000');login();open_page('/dashboard/library');wait('document.body.innerText.includes("SOP.html")');ab('snapshot','-i')
ab('find','role','button','click','--name','Preview','--exact');wait('!!document.querySelector("iframe[srcdoc]")');assert evaluate('document.querySelector("iframe").getAttribute("sandbox")===""');assert evaluate('!document.body.dataset.previewEscaped');assert evaluate('!document.querySelector("iframe").srcdoc.includes("<script")');assert evaluate('!document.querySelector("iframe").srcdoc.includes("href=\\"https://example.invalid")');ab('screenshot','/results/library-html-desktop.png');checks.append('Library HTML opens in a sandboxed modal without executing its script')
ab('find','role','button','click','--name','Close HTML preview','--exact');wait('!document.querySelector("iframe[srcdoc]")');assert evaluate('document.activeElement.textContent==="Preview"');checks.append('closing HTML preview restores keyboard focus')
open_page('/dashboard/projects/library-project?tab=files');wait('document.body.innerText.includes("Executed contract")');assert evaluate('document.body.innerText.includes("uploaded")');ab('find','role','button','click','--name','Add files','--exact');ab('find','role','button','click','--name','From Library');wait('document.body.innerText.includes("Add from Library")');ab('snapshot','-i');ab('screenshot','/results/project-library-picker.png');checks.append('project Add files exposes the Library picker')
ab('find','role','button','click','--name','Close Library','--exact');
# An HTML project file should open the same preview instead of a download.
# Use its row button so the visible user action is exercised.
ab('find','role','button','click','--name','SOP.html')
wait('!!document.querySelector("iframe[srcdoc]")');ab('find','role','button','click','--name','Close HTML preview','--exact');checks.append('admin project HTML opens in the preview modal')
# Use an actual member account, refreshed through normal sign-out/sign-in.
subprocess.run(compose+['run','--rm','--no-deps','library-check','member'],check=True,capture_output=True)
evaluate("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(()=>true)");login();open_page('/portal/projects/library-project?tab=files');wait('document.body.innerText.includes("SOP.html")');ab('snapshot','-i');ab('find','text','SOP.html','click');wait('!!document.querySelector("iframe[srcdoc]")');assert evaluate('!document.body.dataset.previewEscaped');ab('set','viewport','390','844');ab('screenshot','/results/client-html-mobile.png');assert evaluate('document.documentElement.scrollWidth<=innerWidth+1');checks.append('assigned client can preview HTML in a mobile modal without page overflow')
ab('find','role','button','click','--name','Close HTML preview','--exact');open_page('/dashboard/library');wait('location.pathname.startsWith("/portal")');checks.append('client cannot open the admin Library screen')
Path(os.environ['LIBRARY_BROWSER_OUTPUT'],'browser-evidence.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'realLocalHttpsFlow':True,'cloudWrites':0},indent=2)+'\n')
print('Browser checks passed: '+str(len(checks)))
