"""Create scoped connection secrets; initialize restricted passwords while NOLOGIN."""
import datetime,hashlib,importlib.util,json,os,secrets,subprocess,tempfile,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
STACK='growthcast-portal-staging-runtime-connections'
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
SOURCE=Path.home()/'.config/growthcast/portal-staging'
def database_action(action,folder=None):
    command=['docker','run','--rm','--entrypoint','node','-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(SOURCE)+':/source:ro']
    if folder:command+=['-v',str(folder)+':/input:ro']
    result=subprocess.run(command+['growthcast-supabase-preflight','/app/deployment/runtime-connections/provision.mjs',action],capture_output=True)
    assert result.returncode==0,'Restricted role operation failed; details suppressed'
    return json.loads(result.stdout)
def main():
    os.umask(0o077)
    assert not (ROOT/'deployment.json').exists(),'Existing connection deployment requires reconciliation'
    ca=(SOURCE/'prod-ca-2021.crt').read_text()
    assert hashlib.sha256(ca.encode()).hexdigest()=='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
    storage=json.loads((SOURCE/'storage-credentials.json').read_text())
    assert storage['projectRef']=='saedetvoolpdysiyjwvg' and storage['bucket']=='gc-atrium-private' and storage['subject']=='1ee8ab05-20bc-45de-97ed-82a010087cd8'
    assert job.aws('sts','get-caller-identity')['Arn']=='arn:aws:iam::059393269249:root'
    change='connections-'+uuid.uuid4().hex
    with tempfile.TemporaryDirectory() as d:
        folder=Path(d);(folder/'request.json').write_text(json.dumps({'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'CREATE','TemplateBody':(ROOT/'foundation.json').read_text(),'Capabilities':['CAPABILITY_NAMED_IAM']}))
        job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=folder)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        assert plan['Status']!='FAILED','Connection change set failed'
        time.sleep(3)
    else:raise RuntimeError('Change set timeout')
    changes=[c['ResourceChange'] for c in plan['Changes']]
    assert len(changes)==6 and all(c['Action']=='Add' for c in changes)
    (ROOT/'change.json').write_text(json.dumps({'stack':STACK,'changeSet':change,'changes':changes},indent=2)+'\n')
    job.aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change)
    for _ in range(90):
        stack=job.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        if stack['StackStatus']=='CREATE_COMPLETE':break
        assert not ('FAILED' in stack['StackStatus'] or 'ROLLBACK' in stack['StackStatus']),'Connection stack failed'
        time.sleep(3)
    else:raise RuntimeError('Stack timeout')
    resources={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stack':STACK,'resources':resources,'versions':{},'databaseLoginsEnabled':False}
    def save():(ROOT/'deployment.json').write_text(json.dumps(record,indent=2)+'\n')
    save()
    passwords={role:secrets.token_hex(32) for role in ['gc_app','gc_documenso']}
    with tempfile.TemporaryDirectory() as d:
        folder=Path(d);(folder/'passwords.json').write_text(json.dumps(passwords))
        database_action('initialize',folder)
    for service,role in [('atrium','gc_app'),('documenso','gc_documenso')]:
        arn=resources[service.title()+'SecretArn']
        assert not job.aws('secretsmanager','describe-secret','--secret-id',arn).get('VersionIdsToStages'),'Implicit rotation refused'
        value={'schemaVersion':1,'service':service,'projectRef':'saedetvoolpdysiyjwvg','databaseUrl':f'postgresql://{role}.saedetvoolpdysiyjwvg:{passwords[role]}@aws-0-us-east-1.pooler.supabase.com:5432/postgres','databaseCa':ca}
        if service=='atrium':value['storage']=storage
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d);(folder/'value.json').write_text(json.dumps(value))
            written=job.aws('secretsmanager','put-secret-value','--secret-id',arn,'--secret-string','file:///input/value.json',mount=folder)
        returned=job.aws('secretsmanager','get-secret-value','--secret-id',arn,'--version-id',written['VersionId'])
        assert json.loads(returned['SecretString'])==value
        record['versions'][service]=written['VersionId'];save()
    pins={s:{'arn':resources[s.title()+'SecretArn'],'version':record['versions'][s]} for s in ['atrium','documenso']}
    (ROOT/'pins.json').write_text(json.dumps(pins,indent=2)+'\n')
    print('Both scoped connection secrets initialized and read-back verified; runtime database roles remain NOLOGIN.',flush=True)
if __name__=='__main__':main()
