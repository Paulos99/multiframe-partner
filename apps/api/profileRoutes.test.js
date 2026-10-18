import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
import bcrypt from 'bcryptjs';
import {handleProfile,decodeAvatar} from './profileRoutes.js';
import {setObjectStoreTransportForTests} from './objectStore.js';
const current='profile-test-current-only';
let platform,user,writes,storage;
beforeEach(()=>{
 user={id:'profile_test',login:'profile.test',passwordHash:bcrypt.hashSync(current,4),role:'owner',orgId:'org_test'};
 platform={users:[user,{id:'other',login:'occupied'}],orgs:[]};writes=0;storage=[];
 process.env.MATERIALS_BUCKET='unit-materials';process.env.PARTNERS_BUCKET='unit-data';
 setObjectStoreTransportForTests(async op=>{storage.push(op);return op.action==='sign-get'?'https://example.test/private-avatar':{};});
});
function call(method,path,body={}) {
 return handleProfile({method,path,requireAuth:async()=>({platform,user}),getBody:()=>body,savePlatform:async()=>{writes++;},publicUser:u=>({id:u.id,login:u.login,role:u.role}),signToken:async()=> 'unit-token',json:(status,body)=>({status,body})});
}
function webp(w=1,h=1) {const b=Buffer.alloc(30);b.write('RIFF');b.writeUInt32LE(22,4);b.write('WEBP',8);b.write('VP8X',12);b.writeUInt32LE(10,16);b.writeUIntLE(w-1,24,3);b.writeUIntLE(h-1,27,3);return b.toString('base64');}
test('wrong current password cannot change hash or write data',async()=>{const hash=user.passwordHash;await assert.rejects(call('POST','/me/password',{currentPassword:'incorrect',newPassword:'new-test-password-only'}),e=>e.status===403);assert.equal(user.passwordHash,hash);assert.equal(writes,0);});
test('correct password updates bcrypt hash and rotates session',async()=>{const r=await call('POST','/me/password',{currentPassword:current,newPassword:'new-test-password-only'});assert.equal(r.status,200);assert.equal(writes,1);assert.ok(await bcrypt.compare('new-test-password-only',platform.users[0].passwordHash));assert.equal(platform.users[0].sessionVersion,1);assert.equal(r.body.passwordHash,undefined);});
test('password policy rejects weak or bcrypt-truncated passwords',async()=>{for(const p of ['short','a'.repeat(73),'я'.repeat(40)])await assert.rejects(call('POST','/me/password',{currentPassword:current,newPassword:p}),e=>e.status===400);assert.equal(writes,0);});
test('login requires current password',async()=>{await assert.rejects(call('PATCH','/me',{login:'new.login',currentPassword:'incorrect'}),e=>e.status===403);assert.equal(writes,0);});
test('duplicate login is case insensitive',async()=>{await assert.rejects(call('PATCH','/me',{login:'Occupied',currentPassword:current}),e=>e.status===409);assert.equal(writes,0);});
test('profile accepts only login, never role or org changes',async()=>{const r=await call('PATCH','/me',{login:'updated.login',currentPassword:current,role:'admin',orgId:'foreign',phone:'should-not-exist'});assert.equal(r.body.user.login,'updated.login');assert.equal(platform.users[0].role,'owner');assert.equal(platform.users[0].orgId,'org_test');assert.equal(platform.users[0].phone,undefined);});
test('avatar uses only own private materials path',async()=>{const r=await call('PUT','/me/avatar',{mime:'image/webp',base64:webp(),userId:'other'});assert.equal(r.status,200);assert.equal(storage[0].bucket,'unit-materials');assert.equal(storage[0].key,'avatars/profile_test.webp');assert.equal(storage[0].contentType,'image/webp');assert.equal(r.body.user.avatarUrl,'https://example.test/private-avatar');assert.equal(platform.users[0].avatarKey,'avatars/profile_test.webp');});
test('avatar rejects wrong format, oversized bytes and dimensions',()=>{for(const body of [{mime:'image/png',base64:webp()},{mime:'image/webp',base64:webp(257)},{mime:'image/webp',base64:Buffer.alloc(201*1024).toString('base64')},{mime:'image/webp',base64:'aW52YWxpZA=='}])assert.throws(()=>decodeAvatar(body));});
test('avatar cannot fall back to data bucket',async()=>{process.env.MATERIALS_BUCKET=process.env.PARTNERS_BUCKET;await assert.rejects(call('PUT','/me/avatar',{mime:'image/webp',base64:webp()}),e=>e.status===503);assert.equal(storage.length,0);assert.equal(writes,0);});
test('profile reads never expose password hashes',async()=>{const r=await call('GET','/me');assert.equal(r.status,200);assert.equal(r.body.user.passwordHash,undefined);assert.equal(r.body.user.phone,undefined);});
