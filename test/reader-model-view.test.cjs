'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createReaderModelView}=require('../src/reader-model-view.cjs');
test('reader model view: SQL integer IDs and nullable root columns keep one consistent tree identity',async()=>{
 const rows=[{objectId:7,pid:null,rid:null,comment:'Synthetic root'},{objectId:8,pid:7,rid:7,comment:'Synthetic reply'}];
 const calls=[];const raw={Comment:{async select(...args){calls.push(args);return rows;},async add(data){return{...data,objectId:9,pid:7,rid:7};},async count(){return 2;}},Users:{},Counter:{}};
 const view=createReaderModelView(raw);const list=await view.Comment.select({rid:undefined});
 assert.equal(list[0].objectId,'7');assert.equal(list[0].rid,undefined);assert.equal(list[0].pid,undefined);assert.equal(list[1].rid,list[0].objectId);assert.equal(list[1].pid,list[0].objectId);
 assert.deepEqual(calls,[[{rid:undefined}]]);assert.equal(rows[0].rid,null);assert.equal(rows[0].objectId,7);assert.equal((await view.Comment.add({comment:'Synthetic'})).objectId,'9');assert.equal(await view.Comment.count(),2);assert.equal(view.Users,raw.Users);assert.equal(view.Comment.update,undefined);assert.equal(view.Comment.delete,undefined);
});
test('reader model view: malformed model identities fail rather than fabricating a usable row',async()=>{
 for(const objectId of [null,0,-1,1.5,2147483648,'invalid']){
  const view=createReaderModelView({Comment:{select:async()=>[{objectId}],add:async()=>({objectId}),count:async()=>0}});
  await assert.rejects(view.Comment.select({}),/Invalid reader comment identity/);await assert.rejects(view.Comment.add({}),/Invalid reader comment identity/);
 }
});
