import pg from 'pg';
import {supabaseConnection} from '../../deployment/supabase-config.mjs';
import {verifyRuntime} from '../../deployment/runtime/config.mjs';
import {guard} from '../../deployment/supabase/managed-atrium/migrate.mjs';
import {storeWithPool} from '../../gateway/src/store.mjs';
export async function managedGatewayStore({url,projectRef,ca,environment}){
 return storeWithPool(await managedSigningPool({url,projectRef,ca,environment,role:'gc_gateway'}),'staging');
}
export async function managedLifecyclePool(config){return managedSigningPool({...config,role:'gc_lifecycle'});}
async function managedSigningPool({url,projectRef,ca,environment,role:requiredRole}){
 if(environment!=='staging'||projectRef!=='saedetvoolpdysiyjwvg'||!ca?.trim())throw Error('Explicit staging gateway configuration required');
 const config=supabaseConnection({url,projectRef,ca});
 const role=config.user.endsWith('.'+projectRef)?config.user.slice(0,-projectRef.length-1):config.user;
 if(role!==requiredRole)throw Error('Dedicated signing role required');
 config.options='-c search_path=gc_atrium,pg_catalog';config.application_name='growthcast-signing-gateway';
 await verifyRuntime(new pg.Client(config),{role:requiredRole,schema:'gc_atrium'},async db=>{
  await guard(db);
  if(!(await db.query("SELECT name FROM portal_meta.migrations WHERE name='013-document-delivery.sql'")).rowCount)throw Error('Delivery migration required');
 });
 return new pg.Pool({...config,max:4});
}
