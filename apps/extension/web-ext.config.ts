import { defineWebExtConfig } from "wxt";

// Load the dev build unpacked in your own Chrome profile instead of a fresh browser.
export default defineWebExtConfig({ disabled: true });
