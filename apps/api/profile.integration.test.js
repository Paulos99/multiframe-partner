import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import bcrypt from 'bcryptjs';
const dir=mkdtempSync(path.join(tmpdir(),'mf-profile-integration-'));
process.env.PLATFORM_FILE=path.join(dir,'platform.json');process.env.JWT_SECRET='profile-integration-only';
delete process.env.PARTNERS_BUCKET;delete process.env.MATERIALS_BUCKET;
const original='profile-integration-current';
writeFileSync(process.env.PLATFORM_FILE,JSON.stringify({users:[{id:'user_test',login:'profile.integration',role:'crew',orgId:'org_test',displayName:'Test',passwordHash:bcrypt.hashSync(original,4)}],orgs:[],objects:[],projects:[],activity:[]}));
const {handler}=await import('./index.js');
after(()=>rmSync(dir,{recursive:true,force:true}));
async function call(method,p,body,token){const res=await handler({httpMethod:method,path:p,headers:token?{Authorization:`Bearer ${token}`}:{},body:body?JSON.stringify(body):undefined});return {status:res.statusCode,body:JSON.parse(res.body||'{}')};}
test('profile password change invalidates old tokens and preserves own identity',async()=>{
 assert.equal((await call('GET','/me')).status,401);
 const login=await call('POST','/auth/login',{login:'profile.integration',password:original});assert.equal(login.status,200);const old=login.body.token;
 assert.equal((await call('POST','/me/password',{currentPassword:'wrong',newPassword:'profile-integration-new'},old)).status,403);
 const changed=await call('POST','/me/password',{currentPassword:original,newPassword:'profile-integration-new'},old);assert.equal(changed.status,200);
 assert.equal((await call('GET','/me',null,old)).status,401);
 const me=await call('GET','/me',null,changed.body.token);assert.equal(me.status,200);assert.equal(me.body.user.id,'user_test');assert.equal(me.body.user.role,'crew');assert.equal(me.body.user.passwordHash,undefined);
 assert.equal((await call('POST','/auth/login',{login:'profile.integration',password:original})).status,401);
 assert.equal((await call('POST','/auth/login',{login:'profile.integration',password:'profile-integration-new'})).status,200);
 const renamed=await call('PATCH','/me',{login:'profile.renamed',currentPassword:'profile-integration-new'},changed.body.token);assert.equal(renamed.status,200);assert.equal(renamed.body.user.id,'user_test');
 assert.equal((await call('GET','/me',null,changed.body.token)).status,401);
 assert.equal((await call('POST','/auth/login',{login:'profile.renamed',password:'profile-integration-new'})).status,200);
});
