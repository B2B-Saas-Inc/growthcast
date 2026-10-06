// Candidate image only: never mutates the repository's deployed migration manifest.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const folder='/app/deployment/supabase/managed-atrium/migrations/';
const manifest=JSON.parse(readFileSync(folder+'manifest.json'));
if(manifest.migrations.length!==9||manifest.migrations.some(row=>row.name.startsWith('010-')))throw Error('Unexpected baseline');
for(const name of ['010-guest-documents.sql','011-guest-catalog.sql','012-catalog-restore-stable.sql','013-document-delivery.sql']){const sql=readFileSync(folder+name);manifest.migrations.push({name,sha256:createHash('sha256').update(sql).digest('hex')});}
writeFileSync(folder+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
