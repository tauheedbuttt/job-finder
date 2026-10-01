import type { Relay } from "@/lib/messages";
import { pool } from "@/lib/pool";
import { relay } from "@/lib/relay";

export default defineBackground(() => {
  const limit = pool(5);
  browser.runtime.onMessage.addListener((raw: unknown, _sender, reply: (value: unknown) => void) => {
    const msg = raw as Relay;
    if (msg?.type !== "relay") return false;
    limit(() => relay(msg)).then(reply);
    return true;
  });
});
