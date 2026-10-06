"""Reuse actual staff/client UI checks with isolated production-only fixtures."""
from pathlib import Path
import sys,os
import provider as q
sys.path.insert(0,str(q.R.parent))
raw=(q.R.parent/'live-review.py').read_text().replace('growthcast-clients-staging','growthcast-clients').replace('growthcast-guest-live-review','growthcast-guest-production-review')
raw=q.transform(raw).replace("{'sending':False}","{'sending':True}").replace('sending disabled until live signing integration is ready','sending enabled with production-scoped configuration')
m={'__name__':'production_ui_review','__file__':str(q.R.parent/'live-review.py')};exec(compile(raw,str(q.R.parent/'live-review.py'),'exec'),m)
m['OUT']=q.OUT;m['PRIVATE']=Path.home()/'.config/growthcast/guest-review-production';m['legacy']=q.p
os.environ['GC_REVIEW_FIELDS']='1';os.environ['GC_REVIEW_CATALOG']='1'
if sys.argv[1] in ['seed','cleanup']:m['fixture'](sys.argv[1])
elif sys.argv[1]=='review':m['review']()
else:raise ValueError('Unknown operation')
