"""Production document release. Preserve existing production data and identities."""
from pathlib import Path
import sys,importlib.util
R=Path(__file__).resolve().parent
P=R.parents[2]
spec=importlib.util.spec_from_file_location('library_release',P/'deployment/file-library/release.py');legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
legacy.R=R
if __name__=='__main__':{'inventory':lambda:legacy.inventory('production'),'baseline':lambda:legacy.baseline('production'),'poll':lambda:legacy.poll('production')}[sys.argv[1]]()
