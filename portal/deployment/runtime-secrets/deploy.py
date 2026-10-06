"""Create separate staging runtime secret boundaries and initialize once."""
import datetime,importlib.util,json,os,secrets,tempfile,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent;STACK='growthcast-portal-staging-runtime-secrets'
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    os.umask(0o077)
    assert not (ROOT/'deployment.json').exists(),'Review existing secret deployment before changing it'
    caller=job.aws('sts','get-caller-identity');assert caller['Account']=='059393269249' and caller['Arn']=='arn:aws:iam::059393269249:root','Reviewed operator identity required'
    stacks=job.aws('cloudformation','list-stacks','--stack-status-filter','CREATE_COMPLETE','UPDATE_COMPLETE')['StackSummaries'];assert not any(s['StackName']==STACK for s in stacks),'Existing stack needs explicit reconciliation'
    change='runtime-secrets-'+uuid.uuid4().hex
    with tempfile.TemporaryDirectory() as d:
        folder=Path(d);(folder/'request.json').write_text(json.dumps({'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'CREATE','TemplateBody':(ROOT/'foundation.json').read_text(),'Capabilities':['CAPABILITY_NAMED_IAM']}))
        job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=folder)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Runtime secret change set failed')
        time.sleep(3)
    else:raise RuntimeError('Change set timeout')
    changes=[c['ResourceChange'] for c in plan['Changes']];assert len(changes)==12 and all(c['Action']=='Add' for c in changes)
    (ROOT/'change.json').write_text(json.dumps({'stack':STACK,'changeSet':change,'changes':changes},indent=2)+'\n')
    job.aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change)
    print('Creating separate retained staging keys, secrets and ECS-only runtime roles.',flush=True)
    for _ in range(100):
        stack=job.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        if stack['StackStatus']=='CREATE_COMPLETE':break
        if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Runtime secret stack failed; inspect stack events')
        time.sleep(5)
    else:raise RuntimeError('Stack completion timeout')
    out={i['OutputKey']:i['OutputValue'] for i in stack['Outputs']}
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stack':STACK,'resources':out,'versions':{},'scope':'staging-cryptographic-material-only','databaseLoginsEnabled':False,'certificateProvisioned':False}
    (ROOT/'deployment.json').write_text(json.dumps(record,indent=2)+'\n')
    for service,fields in [('atrium',['BETTER_AUTH_SECRET','PORTAL_API_ORIGIN']),('documenso',['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY'])]:
        arn=out[service.title()+'SecretArn'];current=job.aws('secretsmanager','describe-secret','--secret-id',arn);assert not current.get('VersionIdsToStages'),'Refusing implicit rotation'
        value={'schemaVersion':1,'service':service,'secrets':{key:secrets.token_hex(32) for key in fields}}
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d);(folder/'value.json').write_text(json.dumps(value))
            written=job.aws('secretsmanager','put-secret-value','--secret-id',arn,'--secret-string','file:///input/value.json',mount=folder)
        returned=job.aws('secretsmanager','get-secret-value','--secret-id',arn,'--version-id',written['VersionId']);assert json.loads(returned['SecretString'])==value
        record['versions'][service]=written['VersionId'];(ROOT/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');del value,returned
    print('Both staging secret versions initialized and verified without displaying values.',flush=True)
if __name__=='__main__':main()
