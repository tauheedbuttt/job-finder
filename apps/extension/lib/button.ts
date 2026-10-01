const STYLE = `
:host{all:initial;display:inline-block;margin-left:12px;vertical-align:middle}
button{font:600 13px/20px system-ui,sans-serif;padding:3px 12px;border-radius:999px;border:1px solid #0b5566;background:#fff;color:#0b5566;cursor:pointer}
button:hover:not(:disabled){background:#e6f2f4}
button:disabled{cursor:default;opacity:.7}
`;

export type Button = { el: HTMLElement; set: (label: string, busy?: boolean, detail?: string) => void };

export function button(click: () => void): Button {
  const el = document.createElement("span");
  el.dataset.jfButton = "";
  const root = el.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.addEventListener("click", click);
  root.append(style, btn);
  return {
    el,
    set(label, busy = false, detail = "") {
      btn.textContent = label;
      btn.disabled = busy;
      btn.title = detail;
    },
  };
}
