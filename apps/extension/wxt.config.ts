import { defineConfig } from "wxt";

const sizes = [16, 32, 48, 128];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Fixed port per browser: a drifting port left popup.html and the manifest CSP on different servers, so the popup loaded blank.
  dev: { server: { port: process.env.BROWSER === "firefox" ? 3101 : 3100, strictPort: true } },
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
