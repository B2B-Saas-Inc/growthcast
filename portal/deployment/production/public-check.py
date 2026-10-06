from common import *
import urllib.error

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'GrowthCast-Acceptance'})
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.url,r.headers,r.read()
 except urllib.error.HTTPError as e:return e.code,e.url,e.headers,e.read()
base='https://clients.growthcast.app';status,url,headers,body=get(base+'/login');assert status==200 and url.startswith(base) and b'GrowthCast' in body and b'growthcast-wordmark' in body
assert 'noindex' in str(headers).lower() or b'noindex' in body
assert get(base+'/growthcast-wordmark.png')[0]==200
assert get(base+'/growthcast-favicon-v2.jpg')[0]==200
status,url,_,_=get(base+'/dashboard');assert status==200 and '/login' in url
apiStatus=get(base+'/api/projects')[0];assert apiStatus in [401,403]
direct=get('https://api.clients.growthcast.app/api/projects')[0];assert direct in [401,403]
# A clean browser has neither the temporary bypass header nor portal cookies.
checked(['docker','exec','growthcast-production-ui-check','agent-browser','close'])
for attempt in range(3):
 try:
  checked(['docker','exec','growthcast-production-ui-check','agent-browser','open',base+'/login']);break
 except RuntimeError:
  if attempt==2:raise
  time.sleep(2)
r=json.loads(checked(['docker','exec','growthcast-production-ui-check','agent-browser','eval',"JSON.stringify({url:location.href,email:!!document.querySelector('#email'),password:!!document.querySelector('#password'),logo:!!document.querySelector('img[src*=growthcast]')})",'--json']))
x=r['data']['result'];x=json.loads(x) if isinstance(x,str) else x
assert x['url'].startswith(base+'/login') and x['email'] and x['password'] and x['logo']
save(R/'public-evidence.json',{'checkedAt':now(),'publicLoginWithoutVercelAccount':True,'growthcastLogoAndFavicon':True,'anonymousDashboardRedirectsToLogin':True,'anonymousApiStatus':apiStatus,'directApiStatus':direct,'freshBrowserLoginForm':True,'noindex':True})
print('Public production login, branding and anonymous access boundaries passed in a clean browser.')
