import type { Relay, Relayed } from "./messages";

export async function relay(msg: Relay): Promise<Relayed> {
  try {
    const res = await fetch(msg.url, { method: msg.method ?? "GET", headers: msg.headers, body: msg.body, credentials: "omit" });
    return { ok: true, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// A fetch that goes through the background worker; network failure stays a TypeError.
export const relayed = (async (input: string | URL | Request, init?: RequestInit) => {
  const msg: Relay = {
    type: "relay",
    url: String(input),
    method: init?.method,
    headers: init?.headers as Record<string, string> | undefined,
    body: typeof init?.body === "string" ? init.body : undefined,
  };
  const out = (await browser.runtime.sendMessage(msg)) as Relayed;
  if (!out.ok) throw new TypeError(out.error);
  return new Response(out.body, { status: out.status });
}) as typeof fetch;
