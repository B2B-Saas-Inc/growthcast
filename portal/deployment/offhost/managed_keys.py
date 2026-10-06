"""Context-bound KMS wrapping; CLI outputs and plaintext key bytes never enter logs."""
import base64
import json
from pathlib import Path

PROJECT = 'growthcast-portal-staging'

class ManagedKeys:
    def __init__(self, folder, image, run, success):
        self.folder, self.image, self.run, self.success = folder, image, run, success
        self.material = folder/'material'
        self.material.mkdir(mode=0o700)
        self.arn = json.loads(Path(__file__).with_name('kms-configuration.json').read_text())['keyArn']
        assert self.arn.startswith('arn:aws:kms:us-east-1:059393269249:key/')

    def call(self, role, *args):
        return self.run(['docker','run','--rm','-v',str(self.folder/role)+':/credentials:ro',
            '-v',str(self.material)+':/material','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials',
            '-e','AWS_DEFAULT_REGION=us-east-1',self.image,'kms',*args])

    def context(self, archive):
        assert archive.startswith('staging/') and archive.endswith('/backup.gcb')
        return {'project':PROJECT,'archive':archive}

    def wrap(self, key, archive):
        assert len(key) == 32
        plain = self.material/'key'
        plain.write_bytes(key)
        try:
            result = json.loads(self.success(self.call('upload','encrypt','--key-id',self.arn,
                '--plaintext','fileb:///material/key','--encryption-context',json.dumps(self.context(archive)))))
        finally:
            plain.unlink(missing_ok=True)
        assert result['KeyId'] == self.arn
        return {'schemaVersion':1,'keyArn':self.arn,'context':self.context(archive),'ciphertext':result['CiphertextBlob']}

    def decrypt_request(self, envelope, archive, role='restore', context=None):
        assert envelope['schemaVersion'] == 1 and envelope['keyArn'] == self.arn
        assert envelope['context'] == self.context(archive)
        (self.material/'cipher.bin').write_bytes(base64.b64decode(envelope['ciphertext'],validate=True))
        return self.call(role,'decrypt','--key-id',self.arn,'--ciphertext-blob','fileb:///material/cipher.bin',
                         '--encryption-context',json.dumps(context or self.context(archive)))

    def unwrap(self, envelope, archive):
        result = json.loads(self.success(self.decrypt_request(envelope,archive)))
        assert result['KeyId'] == self.arn
        key = base64.b64decode(result['Plaintext'],validate=True)
        assert len(key) == 32
        return key

    def verify_denials(self, envelope, archive):
        def denied(result, code):
            assert result.returncode != 0 and code.encode() in result.stderr, 'Expected KMS denial'
        denied(self.decrypt_request(envelope,archive,role='upload'),'AccessDeniedException')
        denied(self.decrypt_request(envelope,archive,context=self.context('staging/wrong-archive/backup.gcb')),'InvalidCiphertextException')
        denied(self.decrypt_request(envelope,archive,context={'project':'wrong-project','archive':archive}),'AccessDeniedException')
        corrupt=dict(envelope)
        ciphertext=bytearray(base64.b64decode(envelope['ciphertext']));ciphertext[-1]^=1
        corrupt['ciphertext']=base64.b64encode(ciphertext).decode()
        denied(self.decrypt_request(corrupt,archive),'InvalidCiphertextException')
        denied(self.call('restore','encrypt','--key-id',self.arn,'--plaintext','fileb:///material/cipher.bin',
                        '--encryption-context',json.dumps(self.context(archive))),'AccessDeniedException')
