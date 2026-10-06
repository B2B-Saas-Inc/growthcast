"""Request or inspect the staging API certificate; never modify DNS or listeners."""
import datetime
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parent
DOMAIN = 'api.clients.staging.growthcast.app'
spec = importlib.util.spec_from_file_location('handoff', ROOT.parent / 'proxy-secret/transfer.py')
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)
aws = handoff.job.aws


def main():
    assert aws('sts', 'get-caller-identity')['Account'] == '059393269249'
    receipt = ROOT / 'certificate.json'
    if receipt.exists():
        arn = json.loads(receipt.read_text())['certificateArn']
    else:
        existing = aws('acm', 'list-certificates')['CertificateSummaryList']
        assert not any(x['DomainName'] == DOMAIN for x in existing), 'Reconcile existing certificate first'
        arn = aws('acm', 'request-certificate', '--domain-name', DOMAIN,
                  '--validation-method', 'DNS', '--idempotency-token', 'gcStagingApi20260925',
                  '--options', 'CertificateTransparencyLoggingPreference=ENABLED,Export=DISABLED',
                  '--tags', 'Key=Project,Value=growthcast-portal', 'Key=Environment,Value=staging')['CertificateArn']
        receipt.write_text(json.dumps({'certificateArn': arn, 'domain': DOMAIN, 'status': 'REQUESTED'}, indent=2) + '\n')
    assert arn.startswith('arn:aws:acm:us-east-1:059393269249:certificate/')
    for _ in range(12):
        cert = aws('acm', 'describe-certificate', '--certificate-arn', arn)['Certificate']
        assert cert['DomainName'] == DOMAIN and cert['SubjectAlternativeNames'] == [DOMAIN]
        assert cert['Type'] == 'AMAZON_ISSUED'
        options = cert.get('DomainValidationOptions', [])
        if options and 'ResourceRecord' in options[0]:
            break
        time.sleep(2)
    else:
        raise RuntimeError('Validation record not ready; rerun to inspect the existing request')
    record = options[0]['ResourceRecord']
    assert record['Type'] == 'CNAME' and record['Name'].endswith('.' + DOMAIN + '.')
    assert record['Value'].endswith('.acm-validations.aws.')
    receipt.write_text(json.dumps({
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'certificateArn': arn, 'domain': DOMAIN, 'status': cert['Status'],
        'validationStatus': options[0]['ValidationStatus'], 'dnsRecord': record,
        'inUseBy': cert['InUseBy'], 'certificateScriptModifiedDns': False,
        'certificateInUse': bool(cert['InUseBy']),
    }, indent=2) + '\n')
    (ROOT / 'cloudflare-validation.txt').write_text(
        'Zone: growthcast.app\nType: CNAME\nName: ' + record['Name'].removesuffix('.growthcast.app.') +
        '\nTarget: ' + record['Value'].rstrip('.') + '\nProxy status: DNS only\nTTL: Auto\n')
    print('Staging API certificate: ' + cert['Status'] + '; validation record saved, DNS unchanged.')


if __name__ == '__main__':
    main()
