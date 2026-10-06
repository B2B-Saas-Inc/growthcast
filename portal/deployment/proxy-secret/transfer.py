"""Copy only the existing API proof into a sensitive staging-preview variable."""
import datetime,importlib.util,json,os,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parent
PROJECT='prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w';TEAM='team_rPWWEtg8Y7oXBuA7rUHohbU1';KEY='PORTAL_API_ORIGIN_PROOF'
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def vercel(path,method='GET',body=None):
    auth=json.loads((Path.home()/'Library/Application Support/com.vercel.cli/auth.json').read_text())
    request=urllib.request.Request('https://api.vercel.com'+path+('?' if '?' not in path else '&')+'teamId='+TEAM,method=method,headers={'Authorization':'Bearer '+auth['token'],'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
    except urllib.error.HTTPError as error:raise RuntimeError('Vercel operation refused (HTTP '+str(error.code)+'); response suppressed') from None

def main():
    os.umask(0o077)
    assert not (ROOT/'evidence.json').exists(),'Existing handoff requires reconciliation, not implicit rotation'
    project=vercel('/v9/projects/'+PROJECT)
    assert project['id']==PROJECT and project['name']=='growthcast-clients-staging' and project['accountId']==TEAM
    assert project['ssoProtection']['deploymentType']=='all','Protected staging project required'
    before=vercel('/v10/projects/'+PROJECT+'/env')['envs']
    assert not any(v['key']==KEY for v in before),'Existing proof variable requires review'
    assert not any(any(term in v['key'] for term in ['DATABASE','BETTER_AUTH_SECRET','NEXTAUTH_SECRET','ENCRYPTION_KEY','AWS_SECRET']) for v in before),'Unexpected application credentials in web project'
    source=json.loads((ROOT.parent/'runtime-secrets/deployment.json').read_text())
    value=job.aws('secretsmanager','get-secret-value','--secret-id',source['resources']['AtriumSecretArn'],'--version-id',source['versions']['atrium'])
    assert value['ARN']==source['resources']['AtriumSecretArn'] and value['VersionId']==source['versions']['atrium']
    material=json.loads(value['SecretString']);assert material['schemaVersion']==1 and material['service']=='atrium'
    proof=material['secrets']['PORTAL_API_ORIGIN'];assert len(proof)==64 and all(c in '0123456789abcdef' for c in proof)
    response=vercel('/v10/projects/'+PROJECT+'/env','POST',{'key':KEY,'value':proof,'type':'sensitive','target':['preview'],'comment':'Private API origin proof only; no application auth, database or Storage credentials.'})
    del material,value,proof
    assert not response.get('failed'),'Environment creation reported a failure'
    created=response.get('created',response);created=created[0] if isinstance(created,list) else created
    assert created['key']==KEY and created['type']=='sensitive' and created['target']==['preview']
    # Retain a receipt immediately: a failed subsequent read must not cause implicit overwrite.
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'projectId':PROJECT,'teamId':TEAM,'variableId':created['id'],'key':KEY,'type':'sensitive','target':['preview'],'sourceSecretArn':source['resources']['AtriumSecretArn'],'sourceVersion':source['versions']['atrium'],'status':'created-awaiting-metadata-audit','runtimeConsumptionVerified':False,'secretsWrittenToDisk':False}
    (ROOT/'evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    after=vercel('/v10/projects/'+PROJECT+'/env')['envs']
    own=[v for v in after if v['id']==created['id']];assert len(own)==1
    assert own[0]['key']==KEY and own[0]['type']=='sensitive' and own[0]['target']==['preview']
    assert {v['id'] for v in after}=={v['id'] for v in before}|{created['id']},'Unexpected environment inventory change'
    assert vercel('/v9/projects/'+PROJECT)['ssoProtection']==project['ssoProtection']
    record['status']='api-write-and-metadata-verified';record['onlyOneVariableAdded']=True;record['projectProtectionPreserved']=True
    (ROOT/'evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Only the API origin proof was handed to the protected staging project as a sensitive preview variable; runtime verification remains open.')
if __name__=='__main__':main()
