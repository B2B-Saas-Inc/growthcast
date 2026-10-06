"""Controlled staging link-only acceptance; uses only the operator test recipient."""
from pathlib import Path
import importlib.util,sys,json
R=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('live_delivery',R/'live-delivery.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original_private=m.private
path=m.PRIVATE/'optional.json'
if not path.exists():
 f=m.fixture()
 for key in ['document','version','approval','send']:f.pop(key,None)
 f['title']='NONBINDING TEST - GrowthCast optional PIN';original_private('optional.json',f)
m.fixture=lambda:m.p.load(path)
m.private=lambda name,value:original_private('optional.json' if name=='fixture.json' else name,value)
if sys.argv[1]=='prepare':m.prepare()
elif sys.argv[1]=='review':m.review()
elif sys.argv[1]=='access':m.access()
