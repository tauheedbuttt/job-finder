// Content scripts run under the page origin, so the background worker does their fetches.
export type Relay = { type: "relay"; url: string; method?: string; headers?: Record<string, string>; body?: string };
export type Relayed = { ok: true; status: number; body: string } | { ok: false; error: string };
export type Render = { type: "render"; url: string };
export type Rendered = { ok: true; html: string } | { ok: false; error: string };
