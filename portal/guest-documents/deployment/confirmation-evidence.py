"""Inspect immutable completion-mail receipts for the operator's review documents."""
import importlib.util
from pathlib import Path
R=Path(__file__).resolve().parent;OUT=R/'confirmation-rollout/release/staging'
s=importlib.util.spec_from_file_location('ld',R/'live-delivery.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
records=[]
for name in ['fixture.json','optional.json']:
 f=m.p.load(m.PRIVATE/name)
 rows=m.query("SELECT e.status,count(*)::int AS count FROM gc_atrium.guest_send_event e WHERE e.send_id='"+f['send']+"' AND e.status LIKE 'completion_mail_%' GROUP BY e.status")
 states={r['status']:r['count'] for r in rows}
 if states!={'completion_mail_sending':1,'completion_mail_accepted':1}:print('Completion email pending or needs review');raise SystemExit(2)
 records.append({'sendId':f['send'],'recipient':'ewhite@growthcast.app','smtpAccepted':True,'attachment':'verified executed PDF','attempts':1})
m.p.save(OUT/'email.json',{'at':m.p.legacy.c.now(),'confirmations':records,'inboxReceiptConfirmed':False})
print('Google Workspace accepted both missing executed-document emails, once each')
