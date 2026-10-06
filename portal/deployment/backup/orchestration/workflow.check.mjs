import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const flow=JSON.parse(readFileSync(new URL('./workflow.json',import.meta.url))),s=flow.States;
test('both pinned tasks run only after acquiring the exclusive lock',()=>{
 assert.equal(flow.StartAt,'Acquire');assert.equal(s.Acquire.Next,'Backup');assert.equal(s.Acquire.Parameters.ConditionExpression,'attribute_not_exists(environment)');
 for(const name of ['Backup','Restore']){assert.equal(s[name].Resource,'arn:aws:states:::ecs:runTask.sync');assert.match(s[name].Parameters.TaskDefinition,/:\d+$/);assert.equal(s[name].Retry,undefined);assert.equal(s[name].Catch[0].Next,'RetainLockFailure');}
 assert.equal(s.LockUnavailable.Type,'Fail');assert.equal(s.RetainLockFailure.Type,'Fail');
});
test('only successful independent restore can release the matching execution lock',()=>{
 assert.equal(s.RestoreSucceeded.Choices[0].Variable,'$.restore.Containers[0].ExitCode');assert.equal(s.RestoreSucceeded.Choices[0].NumericEquals,0);assert.equal(s.RestoreSucceeded.Choices[0].Next,'Release');
 assert.equal(s.RestoreSucceeded.Default,'RetainLockFailure');assert.equal(s.Release.Parameters.ExpressionAttributeValues[':owner']['S.$'],'$$.Execution.Id');assert.equal(s.Release.Parameters.ConditionExpression,'#owner = :owner');
 const incoming=Object.entries(s).filter(([,v])=>v.Next==='Release'||v.Choices?.some(c=>c.Next==='Release')).map(([k])=>k);assert.deepEqual(incoming,['RestoreSucceeded']);
});
test('receipt versions come from the completed backup, never workflow input or newest-object lookup',()=>{
 assert.equal(s.Receipt.Parameters['event.$'],'States.StringToJson($.logs.Events[2].Message)');
 assert.equal(s.Restore.Parameters.Overrides.ContainerOverrides[0].Environment[1]['Value.$'],'$.receipt.event.receiptVersion');
 assert.equal(s.BackupLogsReady3.Default,'RetainLockFailure');assert.equal(s.BackupSucceeded.Default,'RetainLockFailure');
});
