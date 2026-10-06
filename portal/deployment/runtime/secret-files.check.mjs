import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync, chownSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {applicationEnvironment} from './secret-files.mjs';
import {childEnvironment} from './config.mjs';

test('private delivered material rejects malformed, duplicate, exposed and missing files', () => {
  const root = mkdtempSync(tmpdir() + '/runtime-material-');
  const directory = root + '/material';
  const path = directory + '/application-secret-env.json';
  const uid = 1001;
  const secrets = Object.fromEntries(['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY'].map(key => [key,'a'.repeat(64)]));
  const args = {service:'documenso',mode:'materialized',applicationEnv:{NODE_ENV:'production'},directory,uid};
  try {
    assert.throws(() => applicationEnvironment(args));
    mkdirSync(directory,{mode:0o700}); chownSync(directory,uid,uid);
    const write = value => {rmSync(path,{force:true});writeFileSync(path,JSON.stringify(value),{mode:0o400});chownSync(path,uid,uid);};
    write(secrets);
    assert.deepEqual(applicationEnvironment(args),{NODE_ENV:'production',...secrets});
    assert.throws(() => applicationEnvironment({...args,uid:0}));
    assert.throws(() => applicationEnvironment({...args,uid:1000}));
    assert.throws(() => applicationEnvironment({...args,mode:'typo'}));
    assert.throws(() => applicationEnvironment({...args,service:'atrium'}));
    assert.throws(() => applicationEnvironment({...args,applicationEnv:{NEXTAUTH_SECRET:secrets.NEXTAUTH_SECRET}}));
    assert.throws(() => childEnvironment(applicationEnvironment({...args,applicationEnv:{AWS_ACCESS_KEY_ID:'unexpected'}}),{}));
    chmodSync(path,0o444);assert.throws(() => applicationEnvironment(args));
    chmodSync(path,0o400);chmodSync(directory,0o755);assert.throws(() => applicationEnvironment(args));chmodSync(directory,0o700);
    write({...secrets,DATABASE_URL:'unexpected'});assert.throws(() => applicationEnvironment(args));
    write({...secrets,NEXTAUTH_SECRET:'short'});assert.throws(() => applicationEnvironment(args));
    write(null);assert.throws(() => applicationEnvironment(args));
    write(secrets);const linked = root + '/linked';symlinkSync(directory,linked);assert.throws(() => applicationEnvironment({...args,directory:linked}));
    rmSync(path);symlinkSync('/etc/passwd',path);assert.throws(() => applicationEnvironment(args));
    assert.deepEqual(applicationEnvironment({...args,mode:undefined}),args.applicationEnv);
  } finally {rmSync(root,{recursive:true,force:true});}
});
