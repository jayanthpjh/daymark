export function applicationBrowserOptions(visible) {
  return {
    headless: !visible,
    acceptDownloads: false,
    viewport: { width: 1280, height: 900 },
  };
}

export function launchApplicationBrowser(chromium, profilePath, visible) {
  return chromium.launchPersistentContext(profilePath, applicationBrowserOptions(visible));
}

export function shouldShowApplicationBrowser(task) {
  return task?.visibleBrowserApproved === true && (task.watchBrowser === true || task.manualHandoff === true);
}

export function canReuseApplicationContext(context, visible, contextVisible) {
  if (!context || contextVisible !== visible) return false;
  try {
    context.pages();
    return true;
  } catch {
    return false;
  }
}
