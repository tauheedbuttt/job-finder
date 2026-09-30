import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Finder",
    description: "Side panel that checks if a job needs Finnish and finds the apply button.",
    permissions: ["sidePanel", "storage", "scripting", "tabs"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Job Finder" },
  },
});
