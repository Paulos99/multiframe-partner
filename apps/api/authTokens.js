import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

function currentKey() {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error('JWT_SECRET must be configured');
  return key;
}

export function keyId(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export async function signToken(user) {
  const key = currentKey();
  return new SignJWT({ login: user.login, role: user.role, orgId: user.orgId, sessionVersion: user.sessionVersion || 0 })
    .setProtectedHeader({ alg: 'HS256', kid: keyId(key) })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(key));
}

export async function verifyToken(token) {
  const current = currentKey();
  const previous = process.env.JWT_SECRET_PREVIOUS;
  for (const key of [current, previous].filter(Boolean)) {
    try {
      // jose delegates HMAC verification to WebCrypto (no string signature comparison).
      // Try both configured keys for legacy tokens without kid; kid never grants trust.
      const result = await jwtVerify(token, new TextEncoder().encode(key), {
        algorithms: ['HS256'], requiredClaims: ['sub', 'iat', 'exp'],
      });
      if (result.protectedHeader.kid !== undefined && result.protectedHeader.kid !== keyId(key)) continue;
      return { ...result, usedPreviousKey: key !== current };
    } catch {
      // Includes invalid signatures and expired/malformed claims.
    }
  }
  throw Object.assign(new Error('Unauthorized'), { status: 401 });
}
