"""Check the root homepage brand on the protected staging deployment."""
import json,time,datetime
from pathlib import Path
from browser import ab,open_browser
open_browser('/')
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
for _ in range(30):
 if evaluate("!!document.querySelector('.gc-wordmark img') && document.querySelector('.gc-wordmark img').naturalWidth>0"):break
 time.sleep(.5)
assert evaluate("!document.body.innerText.includes('Atrium')")
assert evaluate("document.querySelector('h1 img').alt==='GrowthCast' && document.querySelector('h1 img').naturalWidth>0")
assert evaluate("document.querySelector('a[href=\"/login\"]').innerText==='Sign In'")
ab('set','viewport','1440','1000');ab('screenshot','/work/brand-home.png')
ab('set','viewport','390','844');ab('screenshot','/work/brand-home-mobile.png')
assert evaluate('document.documentElement.scrollWidth<=innerWidth')
e={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rootLogoLoaded':True,'atriumHeadingAbsent':True,'signInLinkPreserved':True,'mobileNoOverflow':True}
Path(__file__).with_name('home-brand-evidence.json').write_text(json.dumps(e,indent=2)+'\n');print(json.dumps(e))
