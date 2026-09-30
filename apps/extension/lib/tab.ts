import type { Send } from "./analyze";
import type { Message } from "./messages";

export async function active(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab");
  return tab.id;
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
