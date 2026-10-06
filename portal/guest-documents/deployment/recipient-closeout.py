"""Close the controlled staging review and verify its existing recovery workflow."""
from pathlib import Path
import sys,shutil
import prepare as p
R=Path(__file__).resolve().parent/'recipient-rollout';OUT=R/'release/staging';p.legacy.R=R

def cleanup():
 private=Path.home()/'.config/growthcast/signing-live-staging'
 p.checked(['docker','run','--rm','--user','0','--entrypoint','bun','-v',str(private)+':/private','-v',str(R.parent/'delivery-fixture.mjs')+':/fixture.mjs:ro','growthcast-atrium-runtime','/fixture.mjs','cleanup-credentials'])
 p.save(OUT/'cleanup.json',{'at':p.legacy.c.now(),'temporaryReviewerLoginRemoved':True,'nonbindingDocumentsRetainedForOperatorReview':True})
 print('Temporary reviewer login removed; nonbinding review documents retained')
def recovery():
 shutil.copy2(R.parent/'delivery-rollout/release/staging/before-recovery.json',OUT/'before-recovery.json')
 p.legacy.baseline('staging')
def accept():
 assert p.load(OUT/'baseline-verified.json')['status']=='VERIFIED'
 assert p.load(OUT/'cleanup.json')['temporaryReviewerLoginRemoved']
 assert p.load(OUT/'visual.json')['failedAssets']==0
 assert p.load(OUT/'downloads.json')['anonymous']=='denied'
 assert len(p.load(OUT/'completion.json')['completed'])==2
 for stack in ['growthcast-portal-staging-api','growthcast-portal-staging-signing-services']:
  state=p.aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]['StackStatus'];assert state=='UPDATE_COMPLETE'
 for service in ['growthcast-portal-staging-api','growthcast-portal-staging-signing-gateway','growthcast-portal-staging-signing-lifecycle']:
  s=p.aws('ecs','describe-services','--cluster','growthcast-portal-staging-api','--services',service)['services'][0];assert s['runningCount']==s['desiredCount']==1 and s['pendingCount']==0
 rec=p.load(OUT/'before-recovery.json')['outputs'];rule=p.aws('events','describe-rule','--name',rec['ScheduleArn'].split('/')[-1]);assert rule['State']=='ENABLED'
 p.save(OUT/'acceptance.json',{'at':p.legacy.c.now(),'environment':'staging','schema':13,'deliveryEnabled':True,'optionalPin':True,'brand':'GrowthCast','liveRequiredPinCompleted':True,'liveOptionalPinCompleted':True,'projectSignedPdfs':2,'downloadsVerified':True,'anonymousDownloadsDenied':True,'recovery':'VERIFIED','dailyRecovery':rule['ScheduleExpression'],'temporaryReviewerLoginRemoved':True,'productionChanged':False})
 print('Staging recipient signing release accepted')
if __name__=='__main__':{'cleanup':cleanup,'recovery':recovery,'poll':lambda:p.legacy.poll('staging'),'accept':accept}[sys.argv[1]]()
