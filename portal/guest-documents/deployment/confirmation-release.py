"""Staging completion-mail release; existing schema, task, SMTP and recovery."""
from pathlib import Path
import sys,importlib.util,shutil
import prepare as p
R=Path(__file__).resolve().parent;OUT=R/'confirmation-rollout/release/staging';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('recipient_image',R/'delivery-gateway.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);g.OUT=OUT
p.legacy.R=R/'confirmation-rollout'
def recovery():
 shutil.copy2(R/'recipient-rollout/release/staging/before-recovery.json',OUT/'before-recovery.json');p.legacy.baseline('staging')
if __name__=='__main__':{'image':g.image,'api':g.api,'recovery':recovery,'poll':lambda:p.legacy.poll('staging')}[sys.argv[1]]()
