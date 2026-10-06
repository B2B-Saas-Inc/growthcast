import {readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
const root='/app/apps/remix/build/client',assets=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()&&/\.(m?js|css|woff2?|ttf|png|svg|ico)$/.test(file))assets.push('/'+relative(root,file));}}
walk(root);if(!assets.length)throw Error('Provider assets unavailable');process.stdout.write(JSON.stringify(assets.sort()));
