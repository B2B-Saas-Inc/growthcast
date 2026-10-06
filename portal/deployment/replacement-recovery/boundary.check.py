"""Prove the recovery container refuses source, malformed and unmarked targets before connecting."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
for settings in [
 {'projectRef':'saedetvoolpdysiyjwvg','intent':'temporary-replacement-recovery'},
 {'projectRef':'invalid','intent':'temporary-replacement-recovery'},
 {'projectRef':'abcdefghijklmnopqrst','intent':'production'}
]:
    with tempfile.TemporaryDirectory() as d:
        raw=json.dumps(settings).encode();(Path(d)/'settings.json').write_bytes(raw)
        result=subprocess.run(['docker','run','--rm','--network','none','-e','RECOVERY_CONFIG_SHA256='+hashlib.sha256(raw).hexdigest(),'-v',str(ROOT.parent)+':/app/deployment:ro','-v',d+':/target:ro','growthcast-managed-recovery','/app/deployment/replacement-recovery/target.mjs','restore'],capture_output=True)
        assert result.returncode!=0 and b'ERR_ASSERTION' in result.stderr
print('Source-project, malformed-target and missing-recovery-intent guards passed without network access.')
