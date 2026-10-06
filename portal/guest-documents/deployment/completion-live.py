"""Read exact controlled completion records without exposing recipient access secrets."""
import importlib.util
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('ld',R/'live-delivery.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
results=[]
for name,browser_name in [('fixture.json','required-browser.json'),('optional.json','browser.json')]:
 f=m.p.load(m.PRIVATE/name)
 rows=m.query("SELECT c.item_id,c.data_id,c.sha256,c.document_id,d.status,d.\"projectId\",d.\"signedFileId\",s.status AS send_status,a.message_snapshot->'policy'->>'pinDelivery' AS pin_delivery FROM gc_atrium.guest_completed c JOIN gc_atrium.guest_send s ON s.id=c.send_id JOIN gc_atrium.document d ON d.id=c.document_id JOIN gc_atrium.guest_approval a ON a.id=s.approval_id WHERE c.send_id='"+f['send']+"'")
 assert len(rows)==1;v=rows[0];assert v['status']=='signed' and v['projectId']==f['project'] and v['signedFileId'] and v['send_status']=='sent'
 b=m.p.load(m.PRIVATE/browser_name);b['requirePin']=v['pin_delivery']!='none';b['sealed']={'id':v['item_id'],'dataId':v['data_id'],'sha256':v['sha256']};m.private(browser_name,b)
 results.append({'sendId':f['send'],'documentId':v['document_id'],'project':f['project'],'status':'signed','pinRequired':v['pin_delivery']!='none','sha256':v['sha256']})
m.p.save(R/'recipient-rollout/release/staging/completion.json',{'at':m.p.legacy.c.now(),'completed':results,'productionChanged':False})
print('Both controlled documents have verified signed PDFs attached to their original project')
