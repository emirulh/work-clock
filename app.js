(function () {
  "use strict";

  // shortcut: localStorage holds punches on one device only, move to server DB for multi-device sync.
  var STORAGE_KEY = "work_clock_v1";
  var THEME_KEY = "work_clock_theme_v1";

  var Logic = window.WorkClockLogic;

  var els = {
    themeToggle: document.getElementById("theme-toggle"),
    metaThemeColor: document.getElementById("meta-theme-color"),
    storageError: document.getElementById("storage-error"),
    storageErrorText: document.getElementById("storage-error-text"),
    resetStorageBtn: document.getElementById("reset-storage-btn"),
    todayDate: document.getElementById("today-date"),
    punchBtn: document.getElementById("punch-btn"),
    punchStatus: document.getElementById("punch-status"),
    rateInput: document.getElementById("hourly-rate"),
    rateError: document.getElementById("rate-error"),
    eqRate: document.getElementById("eq-rate"),
    eqHours: document.getElementById("eq-hours"),
    eqTotal: document.getElementById("eq-total"),
    eqDuration: document.getElementById("eq-duration"),
    logLoading: document.getElementById("log-loading"),
    logEmpty: document.getElementById("log-empty"),
    logList: document.getElementById("log-list"),
    openClearBtn: document.getElementById("open-clear-btn"),
    clearDialog: document.getElementById("clear-dialog"),
    cancelClearBtn: document.getElementById("cancel-clear-btn"),
    confirmClearBtn: document.getElementById("confirm-clear-btn"),
    iosInstallHelp: document.getElementById("ios-install-help")
  };

  var state = {
    punches: [],
    rawRate: "",
    storageFailed: false
  };

  function formatDateLabel(ms) {
    return new Date(ms).toLocaleDateString("en-MY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function formatTimeLabel(ms) {
    return new Date(ms).toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  }

  function applyTheme(theme) {
    var active = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", active);
    if (els.metaThemeColor) {
      els.metaThemeColor.setAttribute("content", active === "dark" ? "#121316" : "#F6F4EF");
    }
    if (els.themeToggle) {
      var isDark = active === "dark";
      els.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
      els.themeToggle.textContent = isDark ? "Switch to light theme" : "Switch to dark theme";
    }
  }

  function initTheme() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (_) {
      saved = null;
    }
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
      return;
    }
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state.punches = [];
        state.rawRate = "";
        state.storageFailed = false;
        return;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.punches)) {
        throw new Error("Saved punch data is corrupt.");
      }
      state.punches = parsed.punches;
      state.rawRate = typeof parsed.rawRate === "string" ? parsed.rawRate : "";
      state.storageFailed = false;
    } catch (_) {
      state.punches = [];
      state.rawRate = "";
      state.storageFailed = true;
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ punches: state.punches, rawRate: state.rawRate })
      );
      state.storageFailed = false;
    } catch (_) {
      state.storageFailed = true;
    }
  }

  function render() {
    var nowMs = Date.now();
    els.todayDate.textContent = "Today: " + formatDateLabel(nowMs);

    els.storageError.hidden = !state.storageFailed;
    if (state.storageFailed) {
      els.storageErrorText.textContent =
        "Saved records could not be read or written in browser storage. Reset local data to clear the error.";
    }

    var rateCheck = Logic.parseRate(state.rawRate);
    if (!rateCheck.valid) {
      els.rateError.hidden = false;
      els.rateError.textContent = rateCheck.error;
      els.rateInput.setAttribute("aria-invalid", "true");
    } else {
      els.rateError.hidden = true;
      els.rateError.textContent = "";
      els.rateInput.removeAttribute("aria-invalid");
    }

    var summary = Logic.calculateTodaySummary(
      state.punches,
      rateCheck.valid ? rateCheck.rate : 0,
      nowMs
    );

    if (summary.isClockedIn) {
      els.punchBtn.setAttribute("data-state", "out");
      els.punchBtn.textContent = "OUT";
      els.punchBtn.setAttribute("aria-label", "Tap OUT to clock out and record date and time");
      els.punchStatus.textContent =
        "Clocked IN on " +
        formatDateLabel(summary.activeSinceMs) +
        " at " +
        formatTimeLabel(summary.activeSinceMs) +
        ". Tap OUT to finish this shift.";
    } else {
      els.punchBtn.setAttribute("data-state", "in");
      els.punchBtn.textContent = "IN";
      els.punchBtn.setAttribute("aria-label", "Tap IN to clock in and record date and time");
      els.punchStatus.textContent = "Currently clocked out. Tap IN to start recording work time.";
    }

    els.eqRate.textContent = summary.rateText;
    els.eqHours.textContent = summary.hoursText + " hrs";
    els.eqTotal.textContent = summary.earnedText;
    els.eqDuration.textContent =
      "Completed time today: " + summary.completedExactText;

    els.logLoading.hidden = true;
    els.openClearBtn.disabled = state.punches.length === 0;

    if (state.punches.length === 0) {
      els.logEmpty.hidden = false;
      els.logList.hidden = true;
      els.logList.innerHTML = "";
      return;
    }

    els.logEmpty.hidden = true;
    els.logList.hidden = false;
    els.logList.innerHTML = "";

    for (var i = state.punches.length - 1; i >= 0; i--) {
      var item = state.punches[i];
      var li = document.createElement("li");
      li.className = "log-row";

      var badge = document.createElement("span");
      badge.className = item.type === "OUT" ? "stamp stamp-out" : "stamp stamp-in";
      badge.textContent = item.type;

      var meta = document.createElement("div");
      meta.className = "log-meta";

      var timeLine = document.createElement("span");
      timeLine.className = "log-time";
      timeLine.textContent = formatTimeLabel(item.ms);

      var dateLine = document.createElement("span");
      dateLine.className = "log-date";
      dateLine.textContent = formatDateLabel(item.ms);

      meta.appendChild(timeLine);
      meta.appendChild(dateLine);
      li.appendChild(badge);
      li.appendChild(meta);

      els.logList.appendChild(li);
    }
  }

  function bindEvents() {
    els.punchBtn.addEventListener("click", function () {
      state.punches = Logic.recordPunch(state.punches, Date.now());
      saveState();
      render();
    });

    els.rateInput.addEventListener("input", function (e) {
      state.rawRate = e.target.value;
      saveState();
      render();
    });

    els.rateInput.addEventListener("focus", function () {
      if (els.rateInput.scrollIntoView) {
        els.rateInput.scrollIntoView({ block: "nearest" });
      }
    });

    els.themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (_) {}
    });

    els.resetStorageBtn.addEventListener("click", function () {
      state.punches = [];
      state.rawRate = "";
      state.storageFailed = false;
      els.rateInput.value = "";
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
      render();
    });

    els.openClearBtn.addEventListener("click", function () {
      if (state.punches.length === 0) {
        return;
      }
      if (els.clearDialog && typeof els.clearDialog.showModal === "function") {
        els.clearDialog.showModal();
      } else {
        state.punches = [];
        saveState();
        render();
      }
    });

    els.cancelClearBtn.addEventListener("click", function () {
      if (els.clearDialog && els.clearDialog.open) {
        els.clearDialog.close();
      }
    });

    els.confirmClearBtn.addEventListener("click", function () {
      state.punches = [];
      saveState();
      if (els.clearDialog && els.clearDialog.open) {
        els.clearDialog.close();
      }
      render();
      els.punchBtn.focus();
    });

    var isStandalone =
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    if (isStandalone && els.iosInstallHelp) {
      els.iosInstallHelp.open = false;
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  initTheme();
  loadState();
  if (state.rawRate) {
    els.rateInput.value = state.rawRate;
  }
  bindEvents();
  render();
  registerServiceWorker();
})();
