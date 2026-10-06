"""Staging native recipient download route repair; gateway only."""
from pathlib import Path
import sys,importlib.util
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('gateway_release',R/'delivery-gateway.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
g.OUT=R/'download-rollout/release/staging'
if __name__=='__main__':{'image':g.image,'deploy':g.deploy,'status':g.status}[sys.argv[1]]()
