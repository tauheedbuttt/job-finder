import { defineConfig } from "wxt";

const sizes = [16, 32, 48, 128];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Job Finder",
    description: "Checks duunitori jobs for Finnish and experience, translates titles and descriptions.",
    permissions: ["storage", "unlimitedStorage", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Job Finder",
      // Firefox swaps toolbar icons by theme itself: light icon on dark themes.
      ...(browser === "firefox" && {
        theme_icons: sizes.map((size) => ({ light: `icon/${size}.png`, dark: `icon-light/${size}.png`, size })),
      }),
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "job-finder@tauheed.dev",
          strict_min_version: "128.0",
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  }),
});
