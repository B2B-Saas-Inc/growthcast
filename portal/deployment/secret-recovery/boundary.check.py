"""Network-free refusal checks for non-fixture projects, live hosts and unsafe paths."""
import io,json,subprocess,tarfile,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
bad=subprocess.run(['docker','run','--rm','--network','none','--entrypoint','python','-v',str(ROOT.parent)+':/app:ro','growthcast-infra-validator','/app/secret-recovery/run.py','atrium','growthcast-clients-staging'],capture_output=True)
assert bad.returncode!=0 and b'Disposable runtime project required' in bad.stderr
with tempfile.TemporaryDirectory() as folder:
    base=Path(folder)
    for name in ['application','auxiliary','snapshot','restored']:(base/name).mkdir()
    def invoke(action):return subprocess.run(['docker','run','--rm','--user','root','--network','none','--entrypoint','node','-v',str(ROOT)+':/fixture:ro',*[arg for name in ['application','auxiliary','snapshot','restored'] for arg in ['-v',str(base/name)+':/'+name]],'growthcast-recovery','/fixture/bundle.mjs','atrium',action],capture_output=True)
    (base/'application/database-url').write_text('postgresql://gc_app:synthetic@db.saedetvoolpdysiyjwvg.supabase.co:5432/postgres')
    assert invoke('capture').returncode!=0
    assert not list((base/'snapshot').iterdir())
    for scope,paths in [('production',['/application/application-env.json','/auxiliary/api-origin']),('disposable-runtime-secrets',['/application/application-env.json','/outside/private-key'])]:
        data=json.dumps({'schemaVersion':1,'scope':scope,'service':'atrium','files':[{'path':path,'base64':'c3ludGhldGlj','sha256':'0'*64} for path in paths]}).encode()
        with tarfile.open(base/'restored/bundle.tar','w') as tar:
            info=tarfile.TarInfo('secrets.json');info.size=len(data);tar.addfile(info,io.BytesIO(data))
        assert invoke('restore').returncode!=0
        assert not (base/'application/application-env.json').exists() and not list((base/'auxiliary').iterdir())
print('Non-fixture project, live database host, production bundle and unsafe destination refused without network or partial writes.')
