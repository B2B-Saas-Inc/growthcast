"""Send one clearly labeled delivery test, only after the specified recipient confirms."""
import datetime
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    assert not (ROOT/'notification-evidence.json').exists(),'Existing delivery test must not be repeated silently'
    configured=json.loads((ROOT/'provisioning-evidence.json').read_text());assert configured['notificationsEnabled'] is True
    subs=job.aws('sns','list-subscriptions-by-topic','--topic-arn',configured['topicArn'])['Subscriptions']
    assert len(subs)==1 and subs[0]['Protocol']=='email' and subs[0]['Endpoint']=='ewhite@growthcast.app' and subs[0]['SubscriptionArn']!='PendingConfirmation'
    sent=job.aws('sns','publish','--topic-arn',configured['topicArn'],'--subject','GrowthCast backup alert delivery test',
        '--message','This is the GrowthCast staging backup alert delivery test. Hourly independent recovery monitoring is enabled. Automatic backup scheduling remains disabled. This test contains no client documents or credentials.')
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'recipient':'ewhite@growthcast.app','subscriptionConfirmed':True,'messageId':sent['MessageId'],'snsPublishAccepted':True,'inboxReceiptConfirmed':False,'backupScheduleEnabled':False}
    (ROOT/'notification-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Labeled delivery test accepted by SNS for the confirmed recipient; inbox receipt still requires operator confirmation.')

if __name__=='__main__':main()
