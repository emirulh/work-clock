(function () {
  "use strict";

  // shortcut: localStorage holds punches on one device only, move to server DB for multi-device sync.
  var STORAGE_KEY = "work_clock_v1";
  var THEME_KEY = "work_clock_theme_v1";

  var Logic = window.WorkClockLogic;

  var els = {
    metaThemeColor: document.getElementById("meta-theme-color"),
    rateChip: document.getElementById("rate-chip"),
    themeToggle: document.getElementById("theme-toggle"),
    storageError: document.getElementById("storage-error"),
    storageErrorText: document.getElementById("storage-error-text"),
    resetStorageBtn: document.getElementById("reset-storage-btn"),
    liveDate: document.getElementById("live-date"),
    liveClock: document.getElementById("live-clock"),
    punchBtn: document.getElementById("punch-btn"),
    punchStatus: document.getElementById("punch-status"),
    cardInTime: document.getElementById("card-in-time"),
    cardOutTime: document.getElementById("card-out-time"),
    cardTimer: document.getElementById("card-timer"),
    cardEarned: document.getElementById("card-earned"),
    cardFormula: document.getElementById("card-formula"),
    cardRateTrigger: document.getElementById("card-rate-trigger"),
    tabButtons: Array.prototype.slice.call(document.querySelectorAll("[data-tab-target]")),
    tabPanels: {
      calendar: document.getElementById("view-calendar"),
      clock: document.getElementById("view-clock"),
      logs: document.getElementById("view-logs")
    },
    calPrev: document.getElementById("cal-prev"),
    calNext: document.getElementById("cal-next"),
    calMonthLabel: document.getElementById("cal-month-label"),
    calMonthSummary: document.getElementById("cal-month-summary"),
    calGrid: document.getElementById("cal-grid"),
    calDayTitle: document.getElementById("cal-day-title"),
    calDayEmpty: document.getElementById("cal-day-empty"),
    calDayList: document.getElementById("cal-day-list"),
    toggleManualBtn: document.getElementById("toggle-manual-btn"),
    manualDrawer: document.getElementById("manual-drawer"),
    manualIn: document.getElementById("manual-in"),
    manualOut: document.getElementById("manual-out"),
    manualRest: document.getElementById("manual-rest"),
    restChips: Array.prototype.slice.call(document.querySelectorAll("[data-rest-mins]")),
    manualPreview: document.getElementById("manual-preview"),
    manualError: document.getElementById("manual-error"),
    cancelManualBtn: document.getElementById("cancel-manual-btn"),
    saveManualBtn: document.getElementById("save-manual-btn"),
    logLoading: document.getElementById("log-loading"),
    logEmpty: document.getElementById("log-empty"),
    logList: document.getElementById("log-list"),
    openClearBtn: document.getElementById("open-clear-btn"),
    rateDialog: document.getElementById("rate-dialog"),
    rateInput: document.getElementById("hourly-rate"),
    rateError: document.getElementById("rate-error"),
    closeRateBtn: document.getElementById("close-rate-btn"),
    clearDialog: document.getElementById("clear-dialog"),
    cancelClearBtn: document.getElementById("cancel-clear-btn"),
    confirmClearBtn: document.getElementById("confirm-clear-btn")
  };

  var nowInit = new Date();
  var state = {
    punches: [],
    rawRate: "",
    storageFailed: false,
    activeTab: "clock",
    calYear: nowInit.getFullYear(),
    calMonth: nowInit.getMonth(),
    selectedDay: nowInit.getDate(),
    manualOpen: false
  };

  function formatDateShort(ms) {
    return new Date(ms).toLocaleDateString("en-MY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function formatTimeShort(ms) {
    return new Date(ms).toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  }

  function formatClockFull(ms) {
    return new Date(ms).toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function formatMonthTitle(year, month) {
    return new Date(year, month, 1).toLocaleDateString("en-MY", {
      month: "long",
      year: "numeric"
    });
  }

  function applyTheme(theme) {
    var active = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", active);
    if (els.metaThemeColor) {
      els.metaThemeColor.setAttribute("content", active === "light" ? "#F6F4EF" : "#111214");
    }
    if (els.themeToggle) {
      var isDark = active === "dark";
      els.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
      els.themeToggle.textContent = isDark ? "Light" : "Dark";
      els.themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    }
  }

  function initTheme() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (_) {
      saved = null;
    }
    applyTheme(saved === "light" ? "light" : "dark");
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

  function setTab(tabName) {
    if (!els.tabPanels[tabName]) {
      return;
    }
    state.activeTab = tabName;
    for (var i = 0; i < els.tabButtons.length; i++) {
      var btn = els.tabButtons[i];
      var isActive = btn.getAttribute("data-tab-target") === tabName;
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.setAttribute("data-active", isActive ? "true" : "false");
    }
    var keys = Object.keys(els.tabPanels);
    for (var k = 0; k < keys.length; k++) {
      els.tabPanels[keys[k]].hidden = keys[k] !== tabName;
    }
    render();
  }

  function setManualDrawerOpen(isOpen) {
    state.manualOpen = Boolean(isOpen);
    els.manualDrawer.setAttribute("data-open", state.manualOpen ? "true" : "false");
    els.toggleManualBtn.setAttribute("aria-expanded", state.manualOpen ? "true" : "false");
    els.toggleManualBtn.textContent = state.manualOpen ? "Close editor" : "Add shift";
    if (state.manualOpen) {
      updateManualPreview();
    }
  }

  function updateManualPreview() {
    var rateCheck = Logic.parseRate(state.rawRate);
    var safeRate = rateCheck.valid ? rateCheck.rate : 0;
    var preview = Logic.previewManualShift(
      els.manualIn.value,
      els.manualOut.value,
      els.manualRest.value,
      safeRate
    );
    if (!preview.valid) {
      els.manualError.hidden = false;
      els.manualError.textContent = preview.error;
      els.manualPreview.textContent = "Net: 0.00 hrs | RM 0.00";
      els.saveManualBtn.disabled = true;
    } else {
      els.manualError.hidden = true;
      els.manualError.textContent = "";
      els.manualPreview.textContent =
        "Net: " + preview.hoursText + " hrs (" + preview.netHms + ") | " + preview.earnedText;
      els.saveManualBtn.disabled = false;
    }
  }

  function buildPunchRow(item, allowDelete) {
    var li = document.createElement("li");
    li.className = "log-row";

    var left = document.createElement("div");
    left.className = "log-left";

    var stamp = document.createElement("span");
    stamp.className = item.type === "OUT" ? "stamp stamp-out" : "stamp stamp-in";
    stamp.textContent = item.type;

    var timeLine = document.createElement("span");
    timeLine.className = "log-time";
    timeLine.textContent = formatTimeShort(item.ms);

    left.appendChild(stamp);
    left.appendChild(timeLine);

    if (item.restMs && item.restMs > 0) {
      var restTag = document.createElement("span");
      restTag.className = "rest-tag";
      restTag.textContent = "Rest " + String(Math.round(item.restMs / 60000)) + "m";
      left.appendChild(restTag);
    }

    var right = document.createElement("div");
    right.className = "log-right";

    var dateLine = document.createElement("span");
    dateLine.className = "log-date";
    dateLine.textContent = formatDateShort(item.ms);
    right.appendChild(dateLine);

    if (allowDelete && item.pairId && item.type === "OUT") {
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini-delete-btn";
      delBtn.textContent = "Delete";
      delBtn.setAttribute("data-delete-pair", item.pairId);
      delBtn.setAttribute("aria-label", "Delete manual shift");
      right.appendChild(delBtn);
    }

    li.appendChild(left);
    li.appendChild(right);
    return li;
  }

  function renderClockView(summary, rateCheck, nowMs) {
    els.liveDate.textContent = formatDateShort(nowMs);
    els.liveClock.textContent = formatClockFull(nowMs);
    els.rateChip.textContent = summary.rateText + "/hr";

    if (summary.isClockedIn) {
      els.punchBtn.setAttribute("data-state", "out");
      els.punchBtn.textContent = "OUT";
      els.punchBtn.setAttribute("aria-label", "Tap OUT to clock out and stop shift");
      els.punchStatus.textContent = "Clocked in since " + formatTimeShort(summary.activeSinceMs);
    } else {
      els.punchBtn.setAttribute("data-state", "in");
      els.punchBtn.textContent = "IN";
      els.punchBtn.setAttribute("aria-label", "Tap IN to clock in and start shift");
      els.punchStatus.textContent = "Tap IN when your shift starts";
    }

    els.cardInTime.textContent = summary.latestInMs ? formatTimeShort(summary.latestInMs) : "Not yet";
    els.cardOutTime.textContent = summary.isClockedIn
      ? "Active"
      : (summary.latestOutMs ? formatTimeShort(summary.latestOutMs) : "Not yet");

    els.cardTimer.textContent = summary.liveHms;
    els.cardEarned.textContent = summary.earnedText + " today";
    els.cardFormula.textContent =
      "(" + summary.rateText + ") x (" + summary.hoursText + " hrs) = " + summary.earnedText;

    if (!rateCheck.valid) {
      els.rateError.hidden = false;
      els.rateError.textContent = rateCheck.error;
      els.rateInput.setAttribute("aria-invalid", "true");
    } else {
      els.rateError.hidden = true;
      els.rateError.textContent = "";
      els.rateInput.removeAttribute("aria-invalid");
    }
  }

  function renderCalendarView(rate, nowMs) {
    var monthData = Logic.getMonthSummary(state.punches, rate, state.calYear, state.calMonth, nowMs);
    els.calMonthLabel.textContent = formatMonthTitle(state.calYear, state.calMonth);
    els.calMonthSummary.textContent =
      monthData.monthHoursText + " hrs total | " + monthData.monthEarnedText;

    if (state.selectedDay > monthData.daysInMonth) {
      state.selectedDay = monthData.daysInMonth;
    }

    els.calGrid.innerHTML = "";
    for (var pad = 0; pad < monthData.firstWeekday; pad++) {
      var spacer = document.createElement("span");
      spacer.className = "cal-spacer";
      spacer.setAttribute("aria-hidden", "true");
      els.calGrid.appendChild(spacer);
    }

    var selectedEntry = monthData.days[state.selectedDay - 1] || monthData.days[0];
    for (var i = 0; i < monthData.days.length; i++) {
      var d = monthData.days[i];
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell";
      cell.textContent = String(d.day);
      cell.setAttribute("data-day", String(d.day));
      if (d.hasPunches) {
        cell.setAttribute("data-has-work", "true");
      }
      if (d.day === state.selectedDay) {
        cell.setAttribute("aria-pressed", "true");
        cell.setAttribute("data-selected", "true");
      } else {
        cell.setAttribute("aria-pressed", "false");
      }
      cell.setAttribute(
        "aria-label",
        formatDateShort(d.dayMs) + (d.hasPunches ? ", " + d.earnedText : ", no shifts")
      );
      els.calGrid.appendChild(cell);
    }

    els.calDayTitle.textContent =
      formatDateShort(selectedEntry.dayMs) + " (" + selectedEntry.hms + " | " + selectedEntry.earnedText + ")";
    els.calDayList.innerHTML = "";
    if (selectedEntry.punches.length === 0) {
      els.calDayEmpty.hidden = false;
      els.calDayList.hidden = true;
    } else {
      els.calDayEmpty.hidden = true;
      els.calDayList.hidden = false;
      for (var p = 0; p < selectedEntry.punches.length; p++) {
        els.calDayList.appendChild(buildPunchRow(selectedEntry.punches[p], true));
      }
    }

    if (state.manualOpen) {
      updateManualPreview();
    }
  }

  function renderLogsView() {
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
      els.logList.appendChild(buildPunchRow(state.punches[i], false));
    }
  }

  function render() {
    var nowMs = Date.now();
    els.storageError.hidden = !state.storageFailed;
    if (state.storageFailed) {
      els.storageErrorText.textContent =
        "Saved records could not be read or written in browser storage. Reset local data to clear the error.";
    }

    var rateCheck = Logic.parseRate(state.rawRate);
    var safeRate = rateCheck.valid ? rateCheck.rate : 0;
    var summary = Logic.calculateTodaySummary(state.punches, safeRate, nowMs);

    renderClockView(summary, rateCheck, nowMs);
    if (state.activeTab === "calendar") {
      renderCalendarView(safeRate, nowMs);
    }
    renderLogsView();
  }

  function openRateModal() {
    if (els.rateDialog && typeof els.rateDialog.showModal === "function") {
      els.rateDialog.showModal();
      els.rateInput.focus();
    }
  }

  function bindEvents() {
    els.punchBtn.addEventListener("click", function () {
      state.punches = Logic.recordPunch(state.punches, Date.now());
      saveState();
      render();
    });

    els.rateChip.addEventListener("click", openRateModal);
    els.cardRateTrigger.addEventListener("click", openRateModal);

    els.closeRateBtn.addEventListener("click", function () {
      if (els.rateDialog && els.rateDialog.open) {
        els.rateDialog.close();
      }
    });

    els.rateInput.addEventListener("input", function (e) {
      state.rawRate = e.target.value;
      saveState();
      render();
    });

    els.themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (_) {}
    });

    for (var i = 0; i < els.tabButtons.length; i++) {
      els.tabButtons[i].addEventListener("click", function (e) {
        var target = e.currentTarget.getAttribute("data-tab-target");
        setTab(target);
      });
    }

    els.calPrev.addEventListener("click", function () {
      if (state.calMonth === 0) {
        state.calMonth = 11;
        state.calYear -= 1;
      } else {
        state.calMonth -= 1;
      }
      state.selectedDay = 1;
      render();
    });

    els.calNext.addEventListener("click", function () {
      if (state.calMonth === 11) {
        state.calMonth = 0;
        state.calYear += 1;
      } else {
        state.calMonth += 1;
      }
      state.selectedDay = 1;
      render();
    });

    els.calGrid.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-day")) {
        state.selectedDay = Number(target.getAttribute("data-day"));
        render();
      }
    });

    els.toggleManualBtn.addEventListener("click", function () {
      setManualDrawerOpen(!state.manualOpen);
    });

    els.cancelManualBtn.addEventListener("click", function () {
      setManualDrawerOpen(false);
    });

    els.manualIn.addEventListener("input", updateManualPreview);
    els.manualOut.addEventListener("input", updateManualPreview);
    els.manualRest.addEventListener("input", updateManualPreview);

    for (var r = 0; r < els.restChips.length; r++) {
      els.restChips[r].addEventListener("click", function (e) {
        els.manualRest.value = e.currentTarget.getAttribute("data-rest-mins");
        updateManualPreview();
      });
    }

    els.saveManualBtn.addEventListener("click", function () {
      var result = Logic.addManualShift(
        state.punches,
        state.calYear,
        state.calMonth,
        state.selectedDay,
        els.manualIn.value,
        els.manualOut.value,
        els.manualRest.value
      );
      if (!result.valid) {
        els.manualError.hidden = false;
        els.manualError.textContent = result.error;
        return;
      }
      state.punches = result.punches;
      saveState();
      setManualDrawerOpen(false);
      render();
    });

    els.calDayList.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-delete-pair")) {
        var pairId = target.getAttribute("data-delete-pair");
        state.punches = Logic.deleteShiftByPairId(state.punches, pairId);
        saveState();
        render();
      }
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
    });
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
  setTab("clock");

  if (typeof window.setInterval === "function") {
    window.setInterval(function () {
      if (state.activeTab === "clock") {
        var nowMs = Date.now();
        var rateCheck = Logic.parseRate(state.rawRate);
        var summary = Logic.calculateTodaySummary(state.punches, rateCheck.valid ? rateCheck.rate : 0, nowMs);
        renderClockView(summary, rateCheck, nowMs);
      }
    }, 1000);
  }

  registerServiceWorker();
})();
