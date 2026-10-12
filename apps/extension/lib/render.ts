import type { Render, Rendered } from "./messages";
import { pool } from "./pool";

const CAP = 20000;
const SETTLE = 2000;

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

export const web = (url: string) => /^https?:\/\//i.test(url);

type Sender = { tab?: { windowId?: number; index?: number } };

// User clicked Try in tab or Process all: inactive tabs next to the board tab, at most 5 at once.
export function renderer() {
  const limit = pool(5);

  async function one(url: string, from: Sender): Promise<Rendered> {
    // Firefox resolves "" or a relative url against the background page and opens it in a tab.
    if (!web(url)) return { ok: false, error: "no link" };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const at = from.tab?.index;
    const made = browser.tabs.create({ url, active: false, windowId: from.tab?.windowId, ...(at === undefined ? {} : { index: at + 1 }) });
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

  return (msg: Render, from: Sender): Promise<Rendered> => limit(() => one(msg.url, from));
}

// Content side: asks the background to render the page in a tab.
export async function rendered(url: string): Promise<Rendered> {
  try {
    return (await browser.runtime.sendMessage({ type: "render", url } satisfies Render)) as Rendered;
  } catch (err) {
    return { ok: false, error: reason(err) };
  }
}
