export function supabaseConnection({url,projectRef,ca}) {
 if(!/^[a-z]{20}$/.test(projectRef??''))throw Error('Explicit Supabase project reference required');
 let parsed;try{parsed=new URL(url);}catch{throw Error('Invalid database connection');}
 const direct=parsed.hostname===`db.${projectRef}.supabase.co`;
 const session=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname);
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||(!direct&&!session)||parsed.pathname!=='/postgres'||!parsed.password||parsed.hash)throw Error('Expected Supabase database connection');
 if(parsed.port&&parsed.port!=='5432')throw Error('Use direct or session mode on port 5432, not transaction pooling');
 const user=decodeURIComponent(parsed.username);
 const role=session?user.slice(0,-projectRef.length-1):user;
 if(session&&!user.endsWith('.'+projectRef))throw Error('Pooler project mismatch');
 if(!['postgres','gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso','gc_backup'].includes(role))throw Error('Unexpected database role');
 // Never let URL sslmode/sslrootcert parameters replace verified TLS settings.
 if([...parsed.searchParams.keys()].some(key=>!['sslmode'].includes(key))||parsed.searchParams.has('sslmode')&&!['require','verify-full'].includes(parsed.searchParams.get('sslmode')))throw Error('Unsupported database URL options');
 return {host:parsed.hostname,port:5432,database:'postgres',user,password:decodeURIComponent(parsed.password),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:15000,options:'-c default_transaction_read_only=on',application_name:'growthcast-readonly-preflight'};
}
