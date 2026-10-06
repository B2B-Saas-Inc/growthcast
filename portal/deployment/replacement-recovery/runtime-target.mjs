import assert from 'node:assert/strict';
export async function runtimeOperation(db,settings,action) {
  const roles=['gc_app','gc_documenso'];
  if(action==='runtime-disable') {
    for(const role of roles) await db.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE 'gc_%' AND rolcanlogin")).rows[0].n,0);
    return {applicationLoginsDisabled:true};
  }
  if(action==='runtime-enable') {
    for(const role of roles) assert.match(settings.runtimePasswords[role],/^[a-f0-9]{64}$/);
    for(const role of roles) await db.query(`ALTER ROLE ${role} LOGIN PASSWORD '${settings.runtimePasswords[role]}'`);
  }
  await db.query('SET ROLE gc_app');
  try {
    if(action==='runtime-enable') await db.query(`
      INSERT INTO gc_atrium.organization(id,name,"updatedAt") VALUES
      ('runtime-org','Synthetic agency',now()),('runtime-other-org','Other synthetic agency',now());
      INSERT INTO gc_atrium.invitation(id,"organizationId",email,role,status,"expiresAt","inviterId") VALUES
      ('runtime-invite','runtime-org','invited@growthcast.invalid','member','pending',now()+interval '1 hour','synthetic-inviter'),
      ('runtime-expired','runtime-org','expired@growthcast.invalid','member','pending',now()-interval '1 hour','synthetic-inviter')`);
    else if(action==='runtime-enroll') await db.query(`
      INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES
      ('runtime-project','Assigned project','runtime-org',now()),
      ('runtime-unassigned','Unassigned project','runtime-org',now()),
      ('runtime-other-project','Other organization project','runtime-other-org',now());
      INSERT INTO gc_atrium.project_client(id,"projectId","userId") SELECT 'runtime-assignment','runtime-project',id FROM gc_atrium."user" WHERE email='invited@growthcast.invalid';
      INSERT INTO gc_atrium.file(id,filename,"storageKey","projectId","organizationId","uploadedById","updatedAt") VALUES
      ('runtime-unassigned-file','private.txt','unassigned.txt','runtime-unassigned','runtime-org','synthetic-operator',now()),
      ('runtime-other-file','private.txt','other.txt','runtime-other-project','runtime-other-org','synthetic-operator',now())`);
    else if(action==='runtime-unenroll') await db.query("DELETE FROM gc_atrium.project_client WHERE id='runtime-assignment'");
    else throw Error('Unknown runtime operation');
  } finally {await db.query('RESET ROLE');}
  return {stage:action,syntheticTargetOnly:true};
}
