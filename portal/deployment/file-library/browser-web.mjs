import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const child=spawn('bun',['/library/browser-next.mjs'],{stdio:'inherit',env:{...process.env,PORTAL_WEB_URL:'https://portal.growthcast.invalid',PORTAL_API_URL:'https://api.portal.growthcast.invalid',PORTAL_API_ORIGIN_PROOF:readFileSync('/origin/api-origin','utf8').trim(),NODE_EXTRA_CA_CERTS:'/tls/web.crt'}});
child.on('exit',code=>process.exit(code??1));
