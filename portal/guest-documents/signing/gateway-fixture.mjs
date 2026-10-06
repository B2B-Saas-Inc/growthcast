// Disposable integration fixture; never imported by the live runtime.
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {createStore} from '/foundation/gateway/src/store.mjs';
import {createHandler} from '/foundation/gateway/src/server.mjs';
import {deliveryGateway} from './gateway.mjs';
const url=new URL('postgresql://gc_gateway@database/foundation_test');url.password=readFileSync('/credential/password','utf8').trim();url.searchParams.set('options','-csearch_path=gc_atrium,pg_catalog');
const store=createStore(url.href,{ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true}});
const gateway=deliveryGateway({store,pool:store.pool,environment:'local-test'});
const handler=createHandler({store:gateway.store,pinAccess:gateway.pinAccess,origin:'https://signing.growthcast.test:8443',upstream:'http://signing-documenso:3000',assets:new Set(JSON.parse(readFileSync('/provider-runtime/assets.json','utf8')))});
https.createServer({key:readFileSync('/provider-runtime/tls.key'),cert:readFileSync('/provider-runtime/tls.crt')},handler).listen(8443,'0.0.0.0');
