const origins = ["<all_urls>"];

// Firefox can leave host permissions ungranted, which breaks relay fetches.
export async function granted(): Promise<boolean> {
  return browser.permissions.contains({ origins });
}

export async function grant(): Promise<boolean> {
  return browser.permissions.request({ origins });
}
