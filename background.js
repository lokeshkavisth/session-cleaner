// This function is preserved for backward compatibility
// (in case the user clicks the extension icon without the popup)
function getDomainAndTLD(url) {
  const urlObj = new URL(url);
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return urlObj.hostname;
}

// Create context menus on extension installation
chrome.runtime.onInstalled.addListener(() => {
  // Set badge color
  chrome.action.setBadgeBackgroundColor({ color: "#4a90e2" });

  // Create parent context menu
  chrome.contextMenus.create({
    id: "session-cleaner",
    title: "Session Cleaner",
    contexts: ["page", "selection", "link"],
  });

  // Create sub-menus for different cleaning options
  chrome.contextMenus.create({
    id: "clean-all",
    parentId: "session-cleaner",
    title: "🧹 Clean All Data",
    contexts: ["page", "selection", "link"],
  });

  chrome.contextMenus.create({
    id: "clean-cookies",
    parentId: "session-cleaner",
    title: "🍪 Clean Cookies Only",
    contexts: ["page", "selection", "link"],
  });

  chrome.contextMenus.create({
    id: "clean-storage",
    parentId: "session-cleaner",
    title: "💾 Clean Storage Only",
    contexts: ["page", "selection", "link"],
  });

  chrome.contextMenus.create({
    id: "separator-1",
    parentId: "session-cleaner",
    type: "separator",
    contexts: ["page", "selection", "link"],
  });

  chrome.contextMenus.create({
    id: "clean-with-reload",
    parentId: "session-cleaner",
    title: "🔄 Clean and Reload Page",
    contexts: ["page", "selection", "link"],
  });
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  switch (info.menuItemId) {
    case "clean-all":
      performContextMenuCleanup(tab, {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
        autoReload: false,
      });
      break;

    case "clean-cookies":
      performContextMenuCleanup(tab, {
        cookies: true,
        localStorage: false,
        sessionStorage: false,
        indexedDB: false,
        autoReload: false,
      });
      break;

    case "clean-storage":
      performContextMenuCleanup(tab, {
        cookies: false,
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
        autoReload: false,
      });
      break;

    case "clean-with-reload":
      performContextMenuCleanup(tab, {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
        autoReload: true,
      });
      break;
  }
});

// Function to perform cleanup from context menu
function performContextMenuCleanup(tab, preferences) {
  const domain = getDomainAndTLD(tab.url);
  const cleanupResults = {
    cookies: 0,
    localStorage: 0,
    sessionStorage: 0,
    indexedDB: 0,
  };

  // Show notification that cleaning is starting
  chrome.action.setBadgeText({ text: "Cleaning", tabId: tab.id });

  // Clean cookies if enabled
  if (preferences.cookies) {
    chrome.cookies.getAll({ domain: domain }, (cookies) => {
      cleanupResults.cookies = cookies.length;
      for (let cookie of cookies) {
        const cookieUrl = `http${cookie.secure ? "s" : ""}://${cookie.domain}${
          cookie.path
        }`;
        chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    });
  }

  // Clean storage if enabled
  if (
    preferences.localStorage ||
    preferences.sessionStorage ||
    preferences.indexedDB
  ) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        function: clearStoragesFromContext,
        args: [preferences],
      },
      (results) => {
        if (results && results[0]) {
          const result = results[0].result;
          cleanupResults.localStorage = result.localStorage;
          cleanupResults.sessionStorage = result.sessionStorage;
          cleanupResults.indexedDB = result.indexedDB;
        }

        // Save to history
        saveContextMenuHistory(tab.url, cleanupResults, preferences);

        // Show completion notification
        chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: tab.id });
        }, 2000);

        // Auto reload if enabled
        if (preferences.autoReload) {
          setTimeout(() => {
            chrome.tabs.reload(tab.id);
          }, 1000);
        }
      }
    );
  } else {
    // If only cookies were cleaned, show completion immediately
    saveContextMenuHistory(tab.url, cleanupResults, preferences);
    chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "", tabId: tab.id });
    }, 2000);
  }
}

// Function to clear storages from context menu
function clearStoragesFromContext(preferences) {
  const result = {
    localStorage: 0,
    sessionStorage: 0,
    indexedDB: 0,
  };

  // Clear localStorage
  if (preferences.localStorage) {
    result.localStorage = localStorage.length;
    localStorage.clear();
  }

  // Clear sessionStorage
  if (preferences.sessionStorage) {
    result.sessionStorage = sessionStorage.length;
    sessionStorage.clear();
  }

  // Clear IndexedDB
  if (preferences.indexedDB && window.indexedDB) {
    window.indexedDB.databases().then((dbs) => {
      result.indexedDB = dbs.length;
      dbs.forEach((db) => {
        window.indexedDB.deleteDatabase(db.name);
      });
    });
  }

  return result;
}

// Function to save context menu cleaning to history
function saveContextMenuHistory(url, results, preferences) {
  chrome.storage.local.get(["cleaningHistory"], (result) => {
    const history = result.cleaningHistory || [];

    const historyEntry = {
      url: url,
      results: results,
      preferences: preferences,
      timestamp: Date.now(),
      mode: "context-menu",
    };

    // Add new entry to beginning
    history.unshift(historyEntry);

    // Keep only last 50 entries
    const limitedHistory = history.slice(0, 50);

    chrome.storage.local.set({ cleaningHistory: limitedHistory });
  });
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getTabInfo") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        sendResponse({ url: tabs[0].url, tabId: tabs[0].id });
      } else {
        sendResponse({ error: "No active tab found" });
      }
    });
    return true; // Required for async sendResponse
  }
});

// Legacy support: If the user clicks the extension icon directly (when popup is disabled)
chrome.action.onClicked.addListener((tab) => {
  // Only handle clicks if we couldn't show the popup for some reason
  if (!chrome.action.getPopup) {
    legacyCleanup(tab);
  }
});

// Function to handle the legacy cleaning process
function legacyCleanup(tab) {
  const domain = getDomainAndTLD(tab.url);

  // Check if auto-reload is enabled in preferences
  chrome.storage.local.get(["cleanPreferences"], (result) => {
    const autoReload = result.cleanPreferences?.autoReload || false;

    // Clear cookies
    chrome.cookies.getAll({ domain: domain }, (cookies) => {
      for (let cookie of cookies) {
        const cookieUrl = `http${cookie.secure ? "s" : ""}://${cookie.domain}${
          cookie.path
        }`;
        chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    });

    // Clear local storage, session storage, and IndexedDB
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        function: (shouldReload) => {
          // Clear localStorage
          localStorage.clear();

          // Clear sessionStorage
          sessionStorage.clear();

          // Clear IndexedDB
          if (window.indexedDB) {
            window.indexedDB.databases().then((dbs) => {
              dbs.forEach((db) => {
                window.indexedDB.deleteDatabase(db.name);
              });
            });
          }

          // Force a page reload to ensure all changes take effect (only if auto-reload is enabled)
          if (shouldReload) {
            location.reload();
          }
        },
        args: [autoReload],
      },
      () => {
        // Save to history for legacy mode
        saveLegacyHistory(tab.url);

        // Show a notification to the user
        chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: tab.id });
        }, 2000);
      }
    );
  });
}

// Function to save legacy cleaning to history
function saveLegacyHistory(url) {
  chrome.storage.local.get(["cleaningHistory"], (result) => {
    const history = result.cleaningHistory || [];

    const historyEntry = {
      url: url,
      results: {
        cookies: 0, // We don't have exact count in legacy mode
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: 0,
      },
      preferences: {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
        autoReload: false,
      },
      timestamp: Date.now(),
      mode: "legacy",
    };

    // Add new entry to beginning
    history.unshift(historyEntry);

    // Keep only last 50 entries
    const limitedHistory = history.slice(0, 50);

    chrome.storage.local.set({ cleaningHistory: limitedHistory });
  });
}
