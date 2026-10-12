import type { Render, Rendered } from "./messages";
import { pool } from "./pool";

const CAP = 20000;
const SETTLE = 2000;
const IDLE = 1000;

const sleep = (ms: number) => new Promise((go) => setTimeout(go, ms));
const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Resolves once the tab reports complete, checked again after subscribing to avoid a missed event.
function loaded(id: number): Promise<void> {
  return new Promise((done, fail) => {
    const stop = () => {
      browser.tabs.onUpdated.removeListener(watch);
      browser.tabs.onRemoved.removeListener(gone);
    };
    const watch = (tab: number, info: { status?: string }) => {
      if (tab !== id || info.status !== "complete") return;
      stop();
      done();
    };
    const gone = (tab: number) => {
      if (tab !== id) return;
      stop();
      fail(new Error("tab closed"));
    };
    browser.tabs.onUpdated.addListener(watch);
    browser.tabs.onRemoved.addListener(gone);
    void browser.tabs.get(id).then(
      (tab) => tab.status === "complete" && watch(id, tab),
      () => undefined,
    );
  });
}

// One minimized worker window, opened on demand and closed once the queue is idle.
export function renderer(size = 2) {
  const limit = pool(size);
  let win: Promise<number> | null = null;
  let queued = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  browser.windows.onRemoved.addListener(async (id) => {
    if (win && (await win.catch(() => -1)) === id) win = null;
  });

  // Older Firefox rejects focused: false, minimized alone still keeps it out of the way.
  const open = () =>
    (win ??= browser.windows
      .create({ state: "minimized", focused: false })
      .catch(() => browser.windows.create({ state: "minimized" }))
      .then((w) => w!.id!)
      .catch((err) => {
        win = null;
        throw err;
      }));

  const close = () => {
    const was = win;
    win = null;
    void was?.then((id) => browser.windows.remove(id)).catch(() => undefined);
  };

  async function one(url: string): Promise<Rendered> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const made = open().then((windowId) => browser.tabs.create({ windowId, url, active: false }));
    const cap = new Promise<never>((_, fail) => (timer = setTimeout(() => fail(new Error(`timed out after ${CAP / 1000} s`)), CAP)));
    const work = made.then(async (tab) => {
      await loaded(tab.id!);
      await sleep(SETTLE);
      const [got] = await browser.scripting.executeScript({ target: { tabId: tab.id! }, func: () => document.documentElement.outerHTML });
      return String(got?.result ?? "");
    });
    try {
      return { ok: true, html: await Promise.race([work, cap]) };
    } catch (err) {
      return { ok: false, error: reason(err) };
    } finally {
      clearTimeout(timer);
      // Closes the tab even when it opened after the cap fired.
      void made.then((tab) => browser.tabs.remove(tab.id!)).catch(() => undefined);
    }
  }

  return async (msg: Render): Promise<Rendered> => {
    queued++;
    clearTimeout(timer);
    try {
      return await limit(() => one(msg.url));
    } finally {
      if (!--queued) timer = setTimeout(close, IDLE);
    }
  };
}

// Content side: asks the background to render the page in the worker window.
export async function rendered(url: string): Promise<Rendered> {
  try {
    return (await browser.runtime.sendMessage({ type: "render", url } satisfies Render)) as Rendered;
  } catch (err) {
    return { ok: false, error: reason(err) };
  }
}
