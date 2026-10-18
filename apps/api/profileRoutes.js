import bcrypt from 'bcryptjs';
import { materialsBucket, materialsConfigError, putObject, signGetObject } from './objectStore.js';

const LIMIT = 200 * 1024;
function fail(message, status = 400) { throw Object.assign(new Error(message), {status}); }
export function avatarDimensions(buf) {
  if (buf.length < 30 || buf.toString('ascii',0,4) !== 'RIFF' || buf.toString('ascii',8,12) !== 'WEBP') fail('Нужен файл WebP');
  if (buf.readUInt32LE(4) + 8 !== buf.length) fail('Повреждённый WebP');
  const kind = buf.toString('ascii',12,16);
  if (kind === 'VP8X') return [buf.readUIntLE(24,3)+1, buf.readUIntLE(27,3)+1];
  if (kind === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21); return [(bits & 0x3fff)+1, ((bits >>> 14)&0x3fff)+1];
  }
  if (kind === 'VP8 ' && buf[23]===0x9d && buf[24]===1 && buf[25]===0x2a) return [buf.readUInt16LE(26)&0x3fff,buf.readUInt16LE(28)&0x3fff];
  fail('Формат WebP не поддерживается');
}
export function decodeAvatar(body) {
  if (body.mime !== 'image/webp' || typeof body.base64 !== 'string' || body.base64.length > Math.ceil(LIMIT/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) fail('Фото должно быть WebP до 200 КБ');
  const buf=Buffer.from(body.base64,'base64');
  if (!buf.length || buf.length>LIMIT) fail('Фото должно быть до 200 КБ');
  const [w,h]=avatarDimensions(buf);
  if (!w || !h || w>256 || h>256) fail('Размер фото — не более 256 пикселей');
  // Animated WebP is not accepted as a profile image.
  if (buf.toString('ascii',12,16)==='VP8X' && (buf[20]&2)) fail('Нужно статичное фото');
  return buf;
}
export async function profileWithAvatar(user, platform, ctx) {
  const org = user.orgId ? platform.orgs?.find(o=>o.id===user.orgId) : null;
  const result=ctx.publicUser(user,org);
  if (user.avatarKey) {
    if (materialsConfigError()) return {...result,avatarUrl:null};
    result.avatarUrl=await signGetObject({bucket:materialsBucket(),key:user.avatarKey,responseContentType:'image/webp'});
  }
  return result;
}
export async function handleProfile(ctx) {
  const {method,path}=ctx;
  if (!/^\/me(?:\/(?:password|avatar))?$/.test(path)) return null;
  const {platform,user}=await ctx.requireAuth();
  const index=platform.users.findIndex(u=>u.id===user.id);
  if (index<0) return ctx.json(401,{message:'Нужен вход'});
  if (method==='GET' && path==='/me') return ctx.json(200,{user:await profileWithAvatar(user,platform,ctx)});
  if (method==='PATCH' && path==='/me') {
    const body=ctx.getBody();
    const login=String(body.login||'').trim();
    if (!/^[a-zA-Z0-9_.@-]{3,80}$/.test(login)) fail('Логин: 3–80 латинских букв, цифр или символов _.@-');
    if (!await bcrypt.compare(String(body.currentPassword||''),user.passwordHash||'')) fail('Текущий пароль неверен',403);
    if (platform.users.some(u=>u.id!==user.id && u.login.toLowerCase()===login.toLowerCase())) fail('Логин уже занят',409);
    const next={...platform.users[index],login,sessionVersion:(user.sessionVersion||0)+1};
    platform.users[index]=next;
    await ctx.savePlatform(platform);
    return ctx.json(200,{user:await profileWithAvatar(next,platform,ctx),token:await ctx.signToken(next)});
  }
  if (method==='POST' && path==='/me/password') {
    const body=ctx.getBody();
    const current=String(body.currentPassword||''); const password=String(body.newPassword||'');
    if (!await bcrypt.compare(current,user.passwordHash||'')) fail('Текущий пароль неверен',403);
    if (password.length<10 || Buffer.byteLength(password,'utf8')>72) fail('Новый пароль: от 10 символов, не более 72 байт');
    if (password===current) fail('Новый пароль должен отличаться');
    const next={...platform.users[index],passwordHash:await bcrypt.hash(password,12),sessionVersion:(user.sessionVersion||0)+1};
    delete next.password;
    platform.users[index]=next; await ctx.savePlatform(platform);
    return ctx.json(200,{ok:true,token:await ctx.signToken(next)});
  }
  if (method==='PUT' && path==='/me/avatar') {
    const body=ctx.getBody(); const buf=decodeAvatar(body);
    const error=materialsConfigError(); if(error) fail(error,503);
    if(!/^[a-zA-Z0-9_-]+$/.test(user.id)) fail('Некорректный идентификатор пользователя');
    const key=`avatars/${user.id}.webp`;
    await putObject({bucket:materialsBucket(),key,body:buf,contentType:'image/webp'});
    const next={...platform.users[index],avatarKey:key};
    platform.users[index]=next; await ctx.savePlatform(platform);
    return ctx.json(200,{user:await profileWithAvatar(next,platform,ctx)});
  }
  return ctx.json(405,{message:'Метод не поддерживается'});
}
