import type { Message, Send } from "./messages";

export function panel(tabId: number): string {
  return `sidepanel.html?tab=${tabId}`;
}

export function owner(search: string): number | null {
  const id = Number(new URLSearchParams(search).get("tab") ?? NaN);
  return Number.isInteger(id) ? id : null;
}

export function sender(tabId: number): Send {
  return async <T,>(msg: Message): Promise<T> => {
    try {
      return (await browser.tabs.sendMessage(tabId, msg)) as T;
    } catch {
      // Tabs opened before install have no content script yet.
      await browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/content.js"] });
      return (await browser.tabs.sendMessage(tabId, msg)) as T;
    }
  };
}
