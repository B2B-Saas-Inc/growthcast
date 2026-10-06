import test from 'node:test';
import assert from 'node:assert/strict';
import {completionQueue} from './completion-worker.mjs';
test('pending and failed documents do not starve later pages, and polling wraps',async()=>{
 const cursors=[],visited=[];
 const pages=[[{id:'a',binding_ciphertext:'one'},{id:'b',binding_ciphertext:'bad'}],[{id:'c',binding_ciphertext:'three'}],[]];
 const worker=completionQueue({pool:{async query(sql,args){assert.match(sql,/guest_pending_completions/);cursors.push(args[0]);return {rows:pages.shift()};}},secrets:{open(id,value){if(value==='bad')throw Error('private');return {id};}},completion:{async reconcile({sendId}){visited.push(sendId);return sendId==='a'?{pending:true}:{documentId:'signed'};}}});
 assert.deepEqual(await worker.runOnce(),{checked:2,completed:0,failed:1});
 assert.deepEqual(await worker.runOnce(),{checked:1,completed:1,failed:0});
 assert.deepEqual(await worker.runOnce(),{checked:0,completed:0,failed:0});
 assert.deepEqual(cursors,[null,'b','c']);assert.deepEqual(visited,['a','c']);
 pages.push([]);await worker.runOnce();assert.equal(cursors.at(-1),null);
});
