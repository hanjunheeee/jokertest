import test from "node:test"
import assert from "node:assert/strict"
import { createPurchaseController } from "../purchaseController.js"

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
function fixture() {
  const values=new Map(), posts=[], lookups=[]
  let serial=0, refreshes=0
  const behavior={ post: async()=>({}), lookup:async()=>{throw Object.assign(new Error('missing'),{code:'PURCHASE_RESULT_NOT_FOUND'})}, refresh:async()=>{refreshes++} }
  const options={ storage:()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}),post:p=>{posts.push(p);return behavior.post(p)},lookup:id=>{lookups.push(id);return behavior.lookup(id)},refresh:()=>behavior.refresh(),randomId:()=>String(++serial) }
  const controller=createPurchaseController(options);controller.activate('A')
  return {controller,options,values,posts,lookups,behavior,refreshes:()=>refreshes}
}
test('single and bulk submissions persist exact payload and confirmed result',async()=>{
  const f=fixture(); await f.controller.purchase(['skin']); await f.controller.purchase(['card','border'])
  assert.equal(f.posts.length,2);assert.deepEqual(f.posts[1].items,[{itemId:'card'},{itemId:'border'}]);assert.equal(f.controller.store.getState().status,'confirmed');assert.equal(f.refreshes(),2)
})
test('double click while pending sends only one request',async()=>{
  const f=fixture(),d=deferred();f.behavior.post=()=>d.promise
  const running=f.controller.purchase(['skin']);await f.controller.purchase(['skin']);assert.equal(f.posts.length,1);d.resolve({});await running
})
test('lost response survives controller recreation and lookup restores without POST',async()=>{
  const f=fixture();f.behavior.post=async()=>{throw new Error('lost')};await f.controller.purchase(['a','b'])
  const id=f.posts[0].referenceEventId;f.behavior.lookup=async()=>({results:[]})
  const next=createPurchaseController(f.options);next.activate('A');assert.equal(next.store.getState().status,'unknown');await next.check()
  assert.deepEqual(f.lookups,[id]);assert.equal(f.posts.length,1);assert.equal(next.store.getState().status,'confirmed')
})
test('404 lookup remains unknown, retry uses original payload even if selection changes',async()=>{
  const f=fixture();f.behavior.post=async()=>{throw new Error('lost')};await f.controller.purchase(['a','b']);await f.controller.check();assert.equal(f.controller.store.getState().status,'unknown')
  f.behavior.post=async()=>({});await f.controller.purchase(['changed']);assert.deepEqual(f.posts[1],f.posts[0])
})
test('generic server code is unknown, confirmed rejection allows a new request',async()=>{
  const f=fixture();f.behavior.post=async()=>{throw Object.assign(new Error('server'),{code:'INTERNAL_ERROR'})};await f.controller.purchase(['a']);assert.equal(f.controller.store.getState().status,'unknown')
  f.behavior.post=async()=>{throw Object.assign(new Error('funds'),{code:'INSUFFICIENT_BALANCE'})};await f.controller.retry();assert.equal(f.controller.store.getState().status,'rejected')
  f.behavior.post=async()=>({});await f.controller.retry();assert.notEqual(f.posts[2].referenceEventId,f.posts[0].referenceEventId)
})
test('late success cannot change a different account or refresh its wallet',async()=>{
  const f=fixture(),d=deferred();f.behavior.post=()=>d.promise;const running=f.controller.purchase(['a']);f.controller.activate('B');d.resolve({});await running
  assert.equal(f.controller.store.getState().status,'idle');assert.equal(f.refreshes(),0);f.controller.activate('A');assert.equal(f.controller.store.getState().status,'unknown')
})
test('late failure cannot replace the next account state',async()=>{
  const f=fixture(),d=deferred();f.behavior.post=()=>d.promise;const running=f.controller.purchase(['a']);f.controller.activate(null);f.controller.activate('B');d.reject(new Error('lost'));await running
  assert.equal(f.controller.store.getState().status,'idle')
})
test('summary failure after commit cannot reclassify purchase or repeat charge',async()=>{
  const f=fixture();f.behavior.refresh=async()=>{throw new Error('summary')};await f.controller.purchase(['a']);assert.equal(f.controller.store.getState().status,'confirmed');assert.equal(f.posts.length,1)
})
test('storage unavailable prevents sending a purchase',async()=>{
  const f=fixture();f.options.storage=()=>({getItem:()=>null,setItem:()=>{throw new Error('quota')}});const c=createPurchaseController(f.options);c.activate('A');await c.purchase(['a']);assert.equal(f.posts.length,0);assert.match(c.store.getState().error,/전송하지/)
})
test('unreadable old request blocks new purchases rather than losing its key',async()=>{
  const f=fixture();f.values.set('joker:store-purchase:v1:B','bad-json');f.controller.activate('B');await f.controller.purchase(['a']);assert.equal(f.posts.length,0);assert.equal(f.controller.store.getState().status,'blocked')
})
test('lookup outage cannot trigger another POST',async()=>{
  const f=fixture();f.behavior.post=async()=>{throw new Error('lost')};await f.controller.purchase(['a']);f.behavior.lookup=async()=>{throw new Error('offline')};await f.controller.retry();assert.equal(f.posts.length,1);assert.equal(f.controller.store.getState().status,'unknown')
})

test('new bulk confirmation resets only completed feedback, never unknown requests',async()=>{
  const f=fixture();await f.controller.purchase(['a']);f.controller.prepare();assert.equal(f.controller.store.getState().status,'idle');f.behavior.post=async()=>{throw new Error('lost')};await f.controller.purchase(['b']);const pending=f.controller.store.getState();f.controller.prepare();assert.deepEqual(f.controller.store.getState(),pending)
})
