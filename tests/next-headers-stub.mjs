// Minimal next/headers stand-in for tests that import lib/crownprint.ts outside
// a request scope. Only URL composition is under test there; no cookie is read.
export const cookies = async () => ({ get: () => undefined, set: () => {}, delete: () => {} });
export const headers = async () => ({ get: () => null });
