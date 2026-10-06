import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const db=new pg.Client(supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/audit/database-url','utf8').trim(),ca:readFileSync('/audit/ca.crt','utf8')}));
try{await db.connect();const {rows}=await db.query(`SELECT "emailProvider", "emailFrom", "smtpHost", "smtpPort", "smtpSecure", "smtpUser", ("smtpPass" IS NOT NULL AND "smtpPass"<>'') AS "passwordStored" FROM gc_atrium.system_settings WHERE "organizationId"=$1`,['review-a40f59d0c00e6dc6-org']);console.log(JSON.stringify(rows));}finally{await db.end()}
