import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const db=new pg.Client(supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/audit/database-url','utf8').trim(),ca:readFileSync('/audit/ca.crt','utf8')}));
try{await db.connect();const org='review-a40f59d0c00e6dc6-org';const owner=await db.query(`SELECT count(*)::int AS n FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId" WHERE m."organizationId"=$1 AND m.role='owner' AND u.email='ewhite@growthcast.app'`,[org]);if(owner.rows[0].n!==1)throw Error('Review owner mismatch');const statuses=(await db.query('SELECT name,slug FROM gc_atrium.project_status WHERE "organizationId"=$1 ORDER BY "order"',[org])).rows;console.log(JSON.stringify({organizationId:org,statuses}));}finally{await db.end()}
