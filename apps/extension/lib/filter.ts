import type { Result } from "./badge";
import type { Settings } from "./settings";

export function hides(result: Result, settings: Pick<Settings, "hideExperienced">): boolean {
  return settings.hideExperienced && result.experience === "yes";
}

// Hidden, not removed, so turning the filter off brings the card back.
export function sift(card: HTMLElement, hide: boolean): void {
  if (hide) {
    card.dataset.jfHidden = "";
    card.style.display = "none";
  } else if (card.hasAttribute("data-jf-hidden")) {
    delete card.dataset.jfHidden;
    card.style.display = "";
  }
}
