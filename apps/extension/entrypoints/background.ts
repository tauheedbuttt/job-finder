import type { Relay, Render } from "@/lib/messages";
import { pool } from "@/lib/pool";
import { relay } from "@/lib/relay";
import { renderer } from "@/lib/render";

export default defineBackground(() => {
  const limit = pool(5);
  const render = renderer();
  browser.runtime.onMessage.addListener((raw: unknown, sender, reply: (value: unknown) => void) => {
    const msg = raw as Relay | Render;
    if (msg?.type === "relay") limit(() => relay(msg)).then(reply);
    else if (msg?.type === "render") render(msg, sender).then(reply);
    else return false;
    return true;
  });
});
