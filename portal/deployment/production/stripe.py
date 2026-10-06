from common import *
import sys
mode=sys.argv[1];assert mode in ['configure','verify']
if mode=='configure':assert not (R/'stripe-configuration.json').exists()
r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-e','SENTRY_ENABLED=false','-v',str(PRIVATE)+':/private:ro','-v',str(R/'stripe.mjs')+':/stripe.mjs:ro',load(R/'images.json')['api'],'/stripe.mjs',mode],capture_output=True,text=True)
if r.returncode:print(r.stdout[-700:],r.stderr[-700:]);raise RuntimeError('Production Stripe '+mode+' failed; no real payment attempted')
save(R/('stripe-configuration.json' if mode=='configure' else 'stripe-verification.json'),json.loads(r.stdout.strip().splitlines()[-1]));print('Production Stripe '+mode+' passed without creating a payment.')
