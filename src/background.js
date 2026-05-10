chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    agentInstalledAt: new Date().toISOString()
  });
});
