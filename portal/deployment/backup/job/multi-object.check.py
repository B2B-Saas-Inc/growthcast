"""Explicit three-object fixture acceptance of the existing digest-pinned ECS task."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import uuid
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('deployment',ROOT/'deploy.py')
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)

def main():
    os.umask(0o077)
    previous=json.loads((ROOT/'deployment-evidence.json').read_text());assert previous['status']=='STOPPED' and previous['exitCodes']==[0]
    stack=deployment.aws('cloudformation','describe-stacks','--stack-name',deployment.STACK)['Stacks'][0]
    assert stack['StackStatus']=='UPDATE_COMPLETE'
    outputs={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    assert outputs['TaskDefinitionArn']==previous['taskDefinitionArn']
    task=deployment.aws('ecs','describe-task-definition','--task-definition',outputs['TaskDefinitionArn'])['taskDefinition']
    assert task['containerDefinitions'][0]['image']==previous['image']
    journal='growthcast-ecs-object-check-'+str(uuid.uuid4())
    subprocess.run(['docker','volume','create',journal],check=True,capture_output=True)
    def fixture(action):
        result=subprocess.run(['docker','run','--rm','-v',str(ROOT.parent.parent)+':/app/deployment:ro','-v',str(Path.home()/'.config/growthcast/portal-staging/storage-credentials.json')+':/writer/credentials.json:ro','-v',journal+':/journal','growthcast-managed-recovery','/app/deployment/backup/object-fixture.mjs',action],capture_output=True)
        if result.returncode:raise RuntimeError('ECS fixture operation failed; journal '+journal+' retained')
    try:
        fixture('prepare')
        deployment.run_task(outputs,previous['image'])
    finally:
        fixture('cleanup')
        subprocess.run(['docker','volume','rm',journal],check=True,capture_output=True)
    print('Existing ECS image executed against three separately prepared objects; exact fixtures cleaned.')

if __name__=='__main__':main()
