// Minimal next/headers stand-in.
//
// Most tests that reach it only compose URLs and never touch a cookie, so the
// default state is an EMPTY jar and empty headers — byte-for-byte the behaviour
// this stub has always had.
//
// A route handler under test is a different matter: a connect callback decides
// what to do based on which cookies the browser sent, so a test that wants to
// reproduce "a cold browser with no Wynn cookies" needs to be able to say so,
// and a test of the opposite case needs to be able to seed one. `requestScope`
// gives a test a real, mutable jar for the duration of one simulated request.
//
// Nothing is shared between scopes: each call starts from the state the caller
// hands it, and the jar it produces is readable afterwards so a test can assert
// on what the handler set or deleted.

let jar = new Map();
let headerMap = new Map();

const cookieJar = () => ({
  get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  set: (name, value) => {
    // Next's jar accepts (name, value, options) or a single object.
    if (typeof name === "object" && name !== null) jar.set(name.name, name.value);
    else jar.set(name, value);
  },
  delete: (name) => {
    jar.delete(typeof name === "object" && name !== null ? name.name : name);
  },
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
});

export const cookies = async () => cookieJar();
export const headers = async () => ({ get: (name) => headerMap.get(String(name).toLowerCase()) ?? null });

/**
 * Run `fn` as though it were one HTTP request carrying `cookies` and `headers`.
 * Returns the handler's result alongside the cookie jar as the handler left it,
 * so a test can assert on both the response and the cookie side effects.
 */
export async function requestScope({ cookies: initial = {}, headers: hdrs = {} } = {}, fn) {
  const previousJar = jar;
  const previousHeaders = headerMap;
  jar = new Map(Object.entries(initial));
  headerMap = new Map(Object.entries(hdrs).map(([k, v]) => [k.toLowerCase(), v]));
  try {
    const result = await fn();
    return { result, cookies: Object.fromEntries(jar) };
  } finally {
    jar = previousJar;
    headerMap = previousHeaders;
  }
}
