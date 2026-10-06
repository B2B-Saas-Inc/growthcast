"""Controlled nonbinding staging acceptance using the operator's review account."""
from pathlib import Path
import sys,json,uuid,time,os,base64,subprocess,secrets
import prepare as p
R=Path(__file__).resolve().parent;OUT=R/'delivery-rollout/release/staging'
PRIVATE=Path.home()/'.config/growthcast/signing-live-staging';PRIVATE.mkdir(mode=0o700,parents=True,exist_ok=True)
HOST='https://clients.staging.growthcast.app';BROWSER='growthcast-live-signing-review'
def private(name,value):
 path=PRIVATE/name;path.write_text(json.dumps(value));path.chmod(0o600)
def fixture():return p.load(PRIVATE/'fixture.json')
def query(sql):return p.legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':sql,'read_only':True})
def seed():
 if not (PRIVATE/'fixture.json').exists():
  pin=p.load(R/'signing-secrets/pins.json')['delivery'];config=json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
  prefix='signing-review-'+uuid.uuid4().hex
  private('fixture.json',{'prefix':prefix,'project':prefix+'-project','organization':config['organizationId'],'title':'NONBINDING TEST - GrowthCast signing acceptance','recipient':'ewhite@growthcast.app'})
 f=fixture()
 if 'password' not in f:f['password']=secrets.token_hex(24);private('fixture.json',f)
 private('connection.json',p.legacy.connection('staging'))
 p.checked(['docker','run','--rm','--user','0','--entrypoint','bun','-v',str(PRIVATE)+':/private','-v',str(R/'delivery-fixture.mjs')+':/fixture.mjs:ro','growthcast-atrium-runtime','/fixture.mjs','seed'])
 p.save(OUT/'fixture.json',{'project':f['project'],'organization':f['organization'],'nonbinding':True,'recipient':'ewhite@growthcast.app'})
 print('Controlled reviewer and nonbinding test project created')
def ab(*args):return p.checked(['docker','exec',BROWSER,'agent-browser',*args]).decode()
def ev(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(90):
  if ev(js):return
  time.sleep(.5)
 raise RuntimeError('Live browser condition timed out')
def login():
 p.checked(['docker','run','-d','--name',BROWSER,'--shm-size','1g','growthcast-portal-browser'])
 token=p.checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','growthcast-vercel-cli','project','token','growthcast-clients-staging','--scope','b2b-saas']).decode().strip();assert token.count('.')==2
 ab('open',HOST+'/login','--headers',json.dumps({'x-vercel-trusted-oidc-idp-token':token}));del token
 f=fixture();account={'email':f['prefix']+'-reviewer@growthcast.invalid','password':f['password']};wait('!!document.querySelector("#email")');ab('fill','#email',account['email']);ab('fill','#password',account['password']);ab('click','button[type=submit]');wait('!location.pathname.includes("login")');print('Controlled reviewer login passed; credentials withheld')
def post(route,value):
 result=ev("fetch('/api/guest/staff/"+route+"',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]},body:JSON.stringify("+json.dumps(value)+")}).then(async r=>({status:r.status,data:await r.json()}))")
 assert result['status'] in [200,202],(route,result['status']);return result['data']
def prepare():
 f=fixture()
 if 'version' in f:return
 if 'client' not in f:f['client']=post('clients',{'name':f['title']});private('fixture.json',f)
 if 'recipientId' not in f:f['recipientId']=post('recipients',{'clientId':f['client'],'email':f['recipient']});private('fixture.json',f)
 if 'document' not in f:f['document']=post('documents',{'clientId':f['client'],'projectId':f['project'],'kind':'contract'});private('fixture.json',f)
 pdf=p.checked(['docker','run','--rm','--network','none','--entrypoint','node','-v',str(p.P/'guest-documents/web/pdf-fixture.mjs')+':/fixture.mjs:ro','growthcast-guest-runtime','--input-type=module','-e',"import {pdf} from '/fixture.mjs';process.stdout.write(pdf('','','NONBINDING TEST ONLY. {{signature, r1}} {{text, r1, required=true, label=Company}}'));"])
 result=ev("fetch('/api/guest/staff/upload',{method:'POST',headers:{'x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1],'Content-Type':'application/pdf','x-growthcast-document-id':"+json.dumps(f['document'])+",'x-growthcast-document-title':encodeURIComponent("+json.dumps(f['title'])+")},body:Uint8Array.from(atob("+json.dumps(base64.b64encode(pdf).decode())+"),c=>c.charCodeAt(0))}).then(async r=>({status:r.status,data:await r.json()}))")
 assert result['status']==200;f['version']=result['data']['id'];private('fixture.json',f)
 print('Test client, controlled recipient and tagged PDF uploaded through the authenticated live API')
def review():
 f=fixture();ab('open',HOST+'/dashboard/documents');wait('document.body.innerText.includes('+json.dumps(f['title'])+')')
 print(ab('snapshot','-i'))
def access():
 f=fixture();rows=query("SELECT s.status,s.binding_ciphertext,s.access_ciphertext,a.message_snapshot->'policy'->>'pinDelivery' AS pin_delivery FROM gc_atrium.guest_send s JOIN gc_atrium.guest_approval a ON a.id=s.approval_id WHERE s.id='"+f['send']+"' AND s.approval_id='"+f['approval']+"'");assert len(rows)==1 and rows[0]['status']=='sent'
 pin=p.load(R/'signing-secrets/pins.json')['delivery'];config=json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
 private('access-source.json',{'id':f['send'],'key':config['encryptionKey'],'binding':rows[0]['binding_ciphertext'],'access':rows[0]['access_ciphertext'],'version':f['version']})
 try:p.checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','node','-v',str(PRIVATE)+':/private','-v',str(p.P/'guest-documents')+':/guest:ro','growthcast-guest-runtime','/guest/deployment/delivery-access.mjs'])
 finally:(PRIVATE/'access-source.json').unlink(missing_ok=True)
 p.save(OUT/('sent-'+f['send']+'.json'),{'at':p.legacy.c.now(),'sendId':f['send'],'approvedRecipient':f['recipient'],'smtpAcceptedMessages':1 if rows[0]['pin_delivery']=='none' else 2,'inboxReceiptConfirmed':False,'providerAndGatewayPrepared':True})
 print('Approved message delivery accepted by Workspace SMTP; browser fixture remains private')
if __name__=='__main__':{'seed':seed,'login':login,'prepare':prepare,'review':review,'access':access}[sys.argv[1]]()
