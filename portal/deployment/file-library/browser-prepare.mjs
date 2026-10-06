import {execFileSync} from 'node:child_process';
await import('/fixture/provision.mjs');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=portal.growthcast.invalid','-addext','subjectAltName=DNS:portal.growthcast.invalid,DNS:api.portal.growthcast.invalid','-keyout','/tls/web.key','-out','/tls/web.crt'],{stdio:'ignore'});
