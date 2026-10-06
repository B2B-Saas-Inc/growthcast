"""Private object byte checks using real production client and owner sessions."""
from pathlib import Path
import sys,json
R=Path(__file__).resolve().parent
# Reuse the same reviewed login and same-origin API helpers without rerunning report cases.
source=(R/'verify-browser.py').read_text().split("ab('set','viewport','1440','1000')")[0]
exec(compile(source,str(R/'verify-browser.py'),'exec'))
mode=sys.argv[1]
if mode=='upload':
 login('client');api('/projects/mine/'+p+'-project')
 js='''(async()=>{const send=()=>{const f=new FormData();f.append('file',new Blob(['GrowthCast production persistence acceptance\\n'],{type:'text/plain'}),'production-acceptance.txt');return fetch('/api/files/upload/mine?projectId='+PROJECT,{method:'POST',headers:{'x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]||''},body:f})};let r=await send();if(r.status===403)r=await send();return {status:r.status,body:await r.json()}})()'''.replace('PROJECT',json.dumps(p+'-project'))
 r=evaluate(js);assert r['status']==201;r=r['body'];(R/'file-fixture.json').write_text(json.dumps({'id':r['id'],'key':r['storageKey'],'projectId':p+'-project'}))
else:
 r=json.loads((R/'file-fixture.json').read_text())
assert evaluate("(async()=>{const r=await fetch('/api/files/"+r['id']+"/download');return r.status===200&&(await r.text())==='GrowthCast production persistence acceptance\\n'})()")
if mode=='verify-cleanup':
 ab('reload');wait("location.pathname.startsWith('/portal')");assert api('/projects/mine/'+p+'-project')['status']==200
 assert api('/projects/mine/'+p+'-foreign')['status'] in [403,404]
 assert api('/auth/sign-out','POST',{})['status']==200
 assert api('/files/'+r['id']+'/download')['status'] in [401,403]
 login('owner');assert api('/files/'+r['id'],'DELETE')['status'] in [200,204];api('/auth/sign-out','POST',{})
 (R/'file-evidence.json').write_text(json.dumps({'realClientUpload':True,'privateDownloadByteExact':True,'survivedProductionTaskReplacement':True,'existingSessionSurvived':True,'foreignProjectDenied':True,'anonymousDownloadDenied':True,'objectDeleted':True},indent=2)+'\n')
print('Production file '+mode+' passed.')
