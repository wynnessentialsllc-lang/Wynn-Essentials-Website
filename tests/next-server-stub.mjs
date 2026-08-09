// Minimal next/server stand-in, so route handlers can be tested as the plain
// (Request) => Response functions they are. NextResponse extends the platform
// Response, so `new NextResponse(...)` and the real thing behave identically;
// only the `json` helper needs supplying.
export class NextResponse extends Response {
  static json(data, init) {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(data), { ...init, headers });
  }
  static redirect(url, init) {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    return new Response(null, { status, headers: { location: String(url) } });
  }
}
export const NextRequest = Request;
