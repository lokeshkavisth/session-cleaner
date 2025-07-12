document.addEventListener("DOMContentLoaded", () => {
  const cleanBtn = document.getElementById("cleanBtn");
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const summary = document.getElementById("summary");
  const summaryList = document.getElementById("summaryList");

  // Get checkboxes
  const cookiesCheckbox = document.getElementById("cookies");
  const localStorageCheckbox = document.getElementById("localStorage");
  const sessionStorageCheckbox = document.getElementById("sessionStorage");
  const indexedDBCheckbox = document.getElementById("indexedDB");
  const autoReloadCheckbox = document.getElementById("autoReload");

  // History elements
  const historyToggle = document.getElementById("historyToggle");
  const historyContent = document.getElementById("historyContent");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");

  // Tab elements
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // Main tab elements
  const mainTabButtons = document.querySelectorAll(".main-tab-btn");
  const mainTabPanes = document.querySelectorAll(".main-tab-pane");

  // Statistics elements
  const totalCleaningsEl = document.getElementById("totalCleanings");
  const totalCookiesEl = document.getElementById("totalCookies");
  const totalStorageEl = document.getElementById("totalStorage");
  const favoriteSiteEl = document.getElementById("favoriteSite");
  const weeklyChartEl = document.getElementById("weeklyChart");

  // Load saved preferences
  chrome.storage.local.get(["cleanPreferences"], (result) => {
    if (result.cleanPreferences) {
      cookiesCheckbox.checked = result.cleanPreferences.cookies;
      localStorageCheckbox.checked = result.cleanPreferences.localStorage;
      sessionStorageCheckbox.checked = result.cleanPreferences.sessionStorage;
      indexedDBCheckbox.checked = result.cleanPreferences.indexedDB;
      autoReloadCheckbox.checked = result.cleanPreferences.autoReload || false;
    }
  });

  // Load and display history
  loadHistory();

  // Add toggle switch enhancement
  enhanceToggleSwitches();

  // Add dark mode functionality
  initializeDarkMode();

  // Main tab functionality
  mainTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");

      // Update active main tab button
      mainTabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Update active main tab pane
      mainTabPanes.forEach((pane) => pane.classList.remove("active"));
      document.getElementById(`${targetTab}-tab`).classList.add("active");

      // Load statistics if history tab is selected
      if (targetTab === "history") {
        loadStatistics();
      }
    });
  });

  // Sub tab functionality
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");

      // Update active sub tab button
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Update active sub tab pane
      tabPanes.forEach((pane) => pane.classList.remove("active"));
      document.getElementById(`${targetTab}-tab`).classList.add("active");

      // Load statistics if stats tab is selected
      if (targetTab === "stats") {
        loadStatistics();
      }
    });
  });

  // Clear history functionality
  clearHistoryBtn.addEventListener("click", () => {
    chrome.storage.local.remove(["cleaningHistory"], () => {
      loadHistory();
      loadStatistics();
    });
  });

  cleanBtn.addEventListener("click", () => {
    // Show loading state
    cleanBtn.disabled = true;
    status.classList.remove("hidden");
    summary.classList.add("hidden");

    // Save preferences
    const preferences = {
      cookies: cookiesCheckbox.checked,
      localStorage: localStorageCheckbox.checked,
      sessionStorage: sessionStorageCheckbox.checked,
      indexedDB: indexedDBCheckbox.checked,
      autoReload: autoReloadCheckbox.checked,
    };

    chrome.storage.local.set({ cleanPreferences: preferences });

    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = new URL(tab.url);

      const cleanupResults = {
        cookies: 0,
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: 0,
      };

      // Process each cleanup operation
      const cleanupPromises = [];

      // Clean cookies
      if (preferences.cookies) {
        const domain = getDomainAndTLD(tab.url);
        cleanupPromises.push(
          new Promise((resolve) => {
            chrome.cookies.getAll({ domain: domain }, (cookies) => {
              cleanupResults.cookies = cookies.length;
              for (let cookie of cookies) {
                const cookieUrl = `http${cookie.secure ? "s" : ""}://${
                  cookie.domain
                }${cookie.path}`;
                chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
              }
              resolve();
            });
          })
        );
      }

      // Clean storages
      if (
        preferences.localStorage ||
        preferences.sessionStorage ||
        preferences.indexedDB
      ) {
        cleanupPromises.push(
          new Promise((resolve) => {
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id },
                function: clearStorages,
                args: [preferences],
              },
              (results) => {
                if (results && results[0]) {
                  const result = results[0].result;
                  cleanupResults.localStorage = result.localStorage;
                  cleanupResults.sessionStorage = result.sessionStorage;
                  cleanupResults.indexedDB = result.indexedDB;
                }
                resolve();
              }
            );
          })
        );
      }

      // When all cleanup is done
      Promise.all(cleanupPromises).then(() => {
        // Update status
        statusText.textContent = "Completed!";

        // Show summary
        summaryList.innerHTML = "";
        if (preferences.cookies) {
          summaryList.innerHTML += `<li>${cleanupResults.cookies} cookies removed</li>`;
        }
        if (preferences.localStorage) {
          summaryList.innerHTML += `<li>Local storage cleared (${cleanupResults.localStorage} items)</li>`;
        }
        if (preferences.sessionStorage) {
          summaryList.innerHTML += `<li>Session storage cleared (${cleanupResults.sessionStorage} items)</li>`;
        }
        if (preferences.indexedDB) {
          summaryList.innerHTML += `<li>${cleanupResults.indexedDB} IndexedDB databases removed</li>`;
        }

        summary.classList.remove("hidden");

        // Add success animations
        triggerSuccessAnimations();

        // Save to history
        saveToHistory(tab.url, cleanupResults, preferences);

        // Auto reload page if enabled
        if (preferences.autoReload) {
          setTimeout(() => {
            chrome.tabs.reload(tab.id);
          }, 1500); // Wait 1.5 seconds to show the summary first
        }

        // Enable the button after a short delay
        setTimeout(() => {
          cleanBtn.disabled = false;
          status.classList.add("hidden");
        }, 1000);

        // Show the badge on the extension icon
        chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: tab.id });
        }, 2000);
      });
    });
  });

  // Function to load and display history
  function loadHistory() {
    chrome.storage.local.get(["cleaningHistory"], (result) => {
      const history = result.cleaningHistory || [];

      if (history.length === 0) {
        historyList.innerHTML =
          '<div class="history-empty">No cleaning history yet</div>';
        return;
      }

      // Sort history by timestamp (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      // Limit to last 10 entries
      const recentHistory = history.slice(0, 10);

      historyList.innerHTML = recentHistory
        .map((item) => {
          const date = new Date(item.timestamp);
          const timeAgo = getTimeAgo(date);
          const siteName = getDomainFromUrl(item.url);

          const details = [];
          if (item.results.cookies > 0)
            details.push(`${item.results.cookies} cookies`);
          if (item.results.localStorage > 0)
            details.push(`${item.results.localStorage} localStorage items`);
          if (item.results.sessionStorage > 0)
            details.push(`${item.results.sessionStorage} sessionStorage items`);
          if (item.results.indexedDB > 0)
            details.push(`${item.results.indexedDB} IndexedDB databases`);

          // Add mode indicator
          let modeIcon = "🧹";
          let modeText = "Popup";
          if (item.mode === "context-menu") {
            modeIcon = "🖱️";
            modeText = "Context Menu";
          } else if (item.mode === "legacy") {
            modeIcon = "⚡";
            modeText = "Quick Clean";
          }

          return `
          <div class="history-item">
            <div class="history-item-header">
              <div class="history-site">${siteName}</div>
              <div class="history-time">${timeAgo}</div>
            </div>
            <div class="history-details">
              ${details.join(", ")}
              <span class="history-mode">${modeIcon} ${modeText}</span>
            </div>
          </div>
        `;
        })
        .join("");
    });
  }

  // Function to load and display statistics
  function loadStatistics() {
    chrome.storage.local.get(["cleaningHistory"], (result) => {
      const history = result.cleaningHistory || [];

      if (history.length === 0) {
        // Reset all statistics to zero
        totalCleaningsEl.textContent = "0";
        totalCookiesEl.textContent = "0";
        totalStorageEl.textContent = "0";
        favoriteSiteEl.textContent = "-";
        weeklyChartEl.innerHTML =
          '<div class="history-empty">No data available</div>';
        return;
      }

      // Calculate total statistics
      const totalCleanings = history.length;
      const totalCookies = history.reduce(
        (sum, item) => sum + (item.results.cookies || 0),
        0
      );
      const totalStorage = history.reduce(
        (sum, item) =>
          sum +
          (item.results.localStorage || 0) +
          (item.results.sessionStorage || 0) +
          (item.results.indexedDB || 0),
        0
      );

      // Find most cleaned site
      const siteCounts = {};
      history.forEach((item) => {
        const site = getDomainFromUrl(item.url);
        siteCounts[site] = (siteCounts[site] || 0) + 1;
      });

      const favoriteSite = Object.entries(siteCounts).sort(
        ([, a], [, b]) => b - a
      )[0][0];

      // Update statistics display
      totalCleaningsEl.textContent = totalCleanings;
      totalCookiesEl.textContent = totalCookies;
      totalStorageEl.textContent = totalStorage;
      favoriteSiteEl.textContent = favoriteSite;

      // Generate weekly chart
      generateWeeklyChart(history);
    });
  }

  // Function to generate weekly activity chart
  function generateWeeklyChart(history) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const weeklyData = new Array(7).fill(0);

    // Count cleanings for each day of the week
    history.forEach((item) => {
      const itemDate = new Date(item.timestamp);
      const daysDiff = Math.floor((today - itemDate) / (1000 * 60 * 60 * 24));

      if (daysDiff < 7) {
        const dayIndex = (today.getDay() - daysDiff + 7) % 7;
        weeklyData[dayIndex]++;
      }
    });

    // Find maximum value for scaling
    const maxValue = Math.max(...weeklyData, 1);

    // Generate chart HTML
    weeklyChartEl.innerHTML = days
      .map((day, index) => {
        const value = weeklyData[index];
        const height = (value / maxValue) * 100;
        const isToday = index === today.getDay();

        return `
        <div class="chart-bar ${
          isToday ? "active" : ""
        }" style="height: ${height}%">
          <div class="chart-value">${value}</div>
          <div class="chart-label">${day}</div>
        </div>
      `;
      })
      .join("");
  }

  // Function to save cleaning to history
  function saveToHistory(url, results, preferences) {
    chrome.storage.local.get(["cleaningHistory"], (result) => {
      const history = result.cleaningHistory || [];

      const historyEntry = {
        url: url,
        results: results,
        preferences: preferences,
        timestamp: Date.now(),
      };

      // Add new entry to beginning
      history.unshift(historyEntry);

      // Keep only last 50 entries
      const limitedHistory = history.slice(0, 50);

      chrome.storage.local.set({ cleaningHistory: limitedHistory }, () => {
        // Reload history display and statistics
        loadHistory();
        loadStatistics();
      });
    });
  }

  // Function to trigger success animations
  function triggerSuccessAnimations() {
    // Add success class to summary for pulse animation
    summary.classList.add("success-pulse");

    // Add success class to button
    cleanBtn.classList.add("success");

    // Create enhanced confetti animation
    createEnhancedConfetti();

    // Create enhanced celebration emojis
    createEnhancedCelebrationEmojis();

    // Create success checkmark
    createSuccessCheckmark();

    // Create ripple effect
    createSuccessRipple();

    // Remove animation classes after animation completes
    setTimeout(() => {
      summary.classList.remove("success-pulse");
      cleanBtn.classList.remove("success");
    }, 800);
  }

  // Function to create enhanced confetti animation
  function createEnhancedConfetti() {
    const confettiContainer = document.createElement("div");
    confettiContainer.className = "success-animation";

    // Create 18 confetti pieces with more variety
    for (let i = 0; i < 18; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confettiContainer.appendChild(confetti);
    }

    document.body.appendChild(confettiContainer);

    // Remove confetti after animation
    setTimeout(() => {
      if (document.body.contains(confettiContainer)) {
        document.body.removeChild(confettiContainer);
      }
    }, 2500);
  }

  // Function to create enhanced celebration emojis
  function createEnhancedCelebrationEmojis() {
    const emojis = ["🎉", "✨", "🎊", "💫", "🌟", "🎈"];
    const emojiContainer = document.createElement("div");
    emojiContainer.className = "success-animation";

    emojis.forEach((emoji, index) => {
      const emojiElement = document.createElement("div");
      emojiElement.className = "celebration-emoji";
      emojiElement.textContent = emoji;
      emojiContainer.appendChild(emojiElement);
    });

    document.body.appendChild(emojiContainer);

    // Remove emojis after animation
    setTimeout(() => {
      if (document.body.contains(emojiContainer)) {
        document.body.removeChild(emojiContainer);
      }
    }, 2000);
  }

  // Function to create success checkmark
  function createSuccessCheckmark() {
    const checkmark = document.createElement("div");
    checkmark.className = "success-checkmark";
    document.body.appendChild(checkmark);

    // Remove checkmark after animation
    setTimeout(() => {
      if (document.body.contains(checkmark)) {
        document.body.removeChild(checkmark);
      }
    }, 1400);
  }

  // Function to create success ripple effect
  function createSuccessRipple() {
    const ripple = document.createElement("div");
    ripple.className = "success-ripple";
    document.body.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      if (document.body.contains(ripple)) {
        document.body.removeChild(ripple);
      }
    }, 1200);
  }

  // Helper function to get time ago
  function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) {
      return "Just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  }

  // Helper function to get domain from URL
  function getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return "Unknown site";
    }
  }

  // Function to enhance toggle switches
  function enhanceToggleSwitches() {
    const toggleSwitches = document.querySelectorAll(".toggle-switch");

    toggleSwitches.forEach((toggleSwitch) => {
      const checkbox = toggleSwitch.querySelector('input[type="checkbox"]');
      const slider = toggleSwitch.querySelector(".toggle-slider");

      // Add click handler for the entire toggle switch
      toggleSwitch.addEventListener("click", (e) => {
        e.preventDefault();
        checkbox.checked = !checkbox.checked;

        // Trigger change event
        const event = new Event("change", { bubbles: true });
        checkbox.dispatchEvent(event);

        // Add visual feedback
        addToggleFeedback(toggleSwitch, checkbox.checked);
      });

      // Add keyboard support
      toggleSwitch.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          checkbox.checked = !checkbox.checked;

          // Trigger change event
          const event = new Event("change", { bubbles: true });
          checkbox.dispatchEvent(event);

          // Add visual feedback
          addToggleFeedback(toggleSwitch, checkbox.checked);
        }
      });

      // Make toggle switch focusable
      toggleSwitch.setAttribute("tabindex", "0");
      toggleSwitch.setAttribute("role", "switch");
      toggleSwitch.setAttribute("aria-checked", checkbox.checked);

      // Update aria-checked when checkbox changes
      checkbox.addEventListener("change", () => {
        toggleSwitch.setAttribute("aria-checked", checkbox.checked);
      });
    });
  }

  // Function to add visual feedback to toggle switches
  function addToggleFeedback(toggleSwitch, isChecked) {
    // Add a temporary class for visual feedback
    toggleSwitch.classList.add("toggle-feedback");

    // Remove the feedback class after animation
    setTimeout(() => {
      toggleSwitch.classList.remove("toggle-feedback");
    }, 300);
  }

  // Function to initialize dark mode
  function initializeDarkMode() {
    const logo = document.querySelector(".logo");

    // Load saved theme preference
    chrome.storage.local.get(["theme"], (result) => {
      const theme = result.theme || "light";
      setTheme(theme);
    });

    // Add click event listener to logo
    logo.addEventListener("click", () => {
      toggleDarkMode();
    });

    // Add keyboard support for accessibility
    logo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleDarkMode();
      }
    });

    // Make logo focusable
    logo.setAttribute("tabindex", "0");
    logo.setAttribute("role", "button");
    logo.setAttribute("aria-label", "Toggle dark mode");
  }

  // Function to toggle dark mode
  function toggleDarkMode() {
    const logo = document.querySelector(".logo");
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    // Add click animation
    logo.classList.add("clicked");
    setTimeout(() => {
      logo.classList.remove("clicked");
    }, 300);

    // Set new theme
    setTheme(newTheme);

    // Save theme preference
    chrome.storage.local.set({ theme: newTheme });

    // Update aria-label
    logo.setAttribute(
      "aria-label",
      `Switch to ${newTheme === "dark" ? "light" : "dark"} mode`
    );
  }

  // Function to set theme
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    // Update logo indicator
    const logo = document.querySelector(".logo");
    if (theme === "dark") {
      logo.setAttribute("aria-label", "Switch to light mode");
    } else {
      logo.setAttribute("aria-label", "Switch to dark mode");
    }
  }
});

// Helper function to get domain and TLD
function getDomainAndTLD(url) {
  const urlObj = new URL(url);
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return urlObj.hostname;
}

// Function to be injected into the page to clear storages
function clearStorages(preferences) {
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
