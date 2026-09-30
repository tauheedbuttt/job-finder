import { panel } from "@/lib/tab";

export default defineBackground(() => {
  // Off by default, so the panel only exists on tabs where the icon was clicked.
  browser.sidePanel.setOptions({ enabled: false }).catch(console.error);
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    browser.sidePanel.setOptions({ tabId: tab.id, path: panel(tab.id), enabled: true }).catch(console.error);
    browser.sidePanel.open({ tabId: tab.id }).catch(console.error);
  });
});
