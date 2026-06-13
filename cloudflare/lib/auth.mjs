function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

export async function createAuthToken(env) {
  const payload = {
    sub: "admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  };
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  const signature = await sign(payloadSegment, env.AUTH_SIGNING_SECRET);
  return `${payloadSegment}.${encodeBase64Url(signature)}`;
}

export async function verifyAuthToken(token, env) {
  if (!token || !env.AUTH_SIGNING_SECRET) {
    return false;
  }

  const [payloadSegment, signatureSegment] = token.split(".");
  if (!payloadSegment || !signatureSegment) {
    return false;
  }

  const expected = await sign(payloadSegment, env.AUTH_SIGNING_SECRET);
  const actual = decodeBase64Url(signatureSegment);
  if (actual.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual[index] ^ expected[index];
  }
  if (mismatch !== 0) {
    return false;
  }

  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadSegment)));
  return payload.exp > Math.floor(Date.now() / 1000);
}

export async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return verifyAuthToken(token, env);
}
