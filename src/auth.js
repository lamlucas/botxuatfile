const ADMIN_USERNAME = 'Black7777';
const COOKIE_NAME = 'ads_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function base64urlEncode(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64urlEncode(new Uint8Array(sig));
}

export async function createToken(env, payload) {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }));
  const sig = await hmacSign(env.JWT_SECRET, `${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export async function verifyToken(env, token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = await hmacSign(env.JWT_SECRET, `${header}.${body}`);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function requireAdmin(env, request) {
  const token = getTokenFromRequest(request);
  const payload = await verifyToken(env, token);
  if (!payload || payload.role !== 'admin' || payload.sub !== ADMIN_USERNAME) {
    return null;
  }
  return payload;
}

export async function login(env, username, password) {
  if (username !== ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return { ok: false, error: 'Invalid credentials' };
  }
  const token = await createToken(env, { sub: ADMIN_USERNAME, role: 'admin' });
  return { ok: true, token };
}

export function sessionCookie(token, secure = true) {
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie(secure = true) {
  const flags = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export { ADMIN_USERNAME, COOKIE_NAME };
