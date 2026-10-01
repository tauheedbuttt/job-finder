import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Finder",
    description: "Checks duunitori jobs for Finnish and experience, translates titles and descriptions.",
    permissions: ["storage"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Job Finder" },
  },
});
