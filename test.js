"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Logic = require("./logic.js");

// 1. Calculation, live timer, manual shift with rest deduction, and delete tests
{
  const t0 = new Date(2026, 10, 28, 9, 0, 0).getTime();
  const tMid = new Date(2026, 10, 28, 10, 30, 15).getTime();
  const t1 = new Date(2026, 10, 28, 13, 30, 0).getTime();

  let punches = Logic.recordPunch([], t0);
  const live = Logic.calculateTodaySummary(punches, 20, tMid);
  assert.equal(live.isClockedIn, true);
  assert.equal(live.liveHms, "01:30:15");
  assert.equal(live.earnedText, "RM 30.08");

  punches = Logic.recordPunch(punches, t1);
  const done = Logic.calculateTodaySummary(punches, 25.5, t1);
  assert.equal(done.hoursText, "4.50");
  assert.equal(done.earnedText, "RM 114.75");

  // Manual missed day: 09:00 to 18:00 (9h) minus 60m rest = 8.00h = RM 160.00 at RM 20/hr
  const badOut = Logic.addManualShift([], 2026, 10, 25, "18:00", "09:00", 60);
  assert.equal(badOut.valid, false);
  const badRest = Logic.addManualShift([], 2026, 10, 25, "09:00", "10:00", 60);
  assert.equal(badRest.valid, false);

  const added = Logic.addManualShift([], 2026, 10, 25, "09:00", "18:00", 60);
  assert.equal(added.valid, true);
  const month = Logic.getMonthSummary(added.punches, 20, 2026, 10, t1);
  assert.equal(month.days[24].hms, "08:00:00");
  assert.equal(month.days[24].earnedText, "RM 160.00");
  assert.equal(month.monthEarnedText, "RM 160.00");

  const afterDel = Logic.deleteShiftByPairId(added.punches, added.pairId);
  assert.equal(afterDel.length, 0);
}

// 2. Hygiene & WCAG AA contrast verification across dark and light modes
{
  const files = ["index.html", "logic.js", "app.js", "manifest.webmanifest", "sw.js"];
  for (const f of files) {
    const content = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.equal(content.includes("\u2014"), false, `Em dash found in ${f}`);
  }
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.equal(html.includes("user-scalable=no"), false);
  assert.equal(html.includes("maximum-scale=1"), false);

  const lum = (h) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const cr = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const textPairs = [
    ["#F5F5F7", "#111214"], ["#F5F5F7", "#1E1F23"], ["#B6B8C2", "#1E1F23"],
    ["#FFFFFF", "#354F1A"], ["#FFFFFF", "#B91C1C"], ["#111214", "#F5F5F7"],
    ["#FCA5A5", "#2A1215"], ["#18181B", "#F2F2F7"], ["#52525B", "#FFFFFF"],
    ["#991B1B", "#FEF2F2"]
  ];
  for (const [fg, bg] of textPairs) {
    assert.ok(cr(fg, bg) >= 4.5, `Text contrast fail ${fg} on ${bg}: ${cr(fg, bg).toFixed(2)}`);
  }
  const uiPairs = [
    ["#8A8D98", "#111214"], ["#8A8D98", "#1E1F23"], ["#A3E635", "#111214"],
    ["#FCA5A5", "#111214"], ["#71717A", "#FFFFFF"], ["#1D4ED8", "#FFFFFF"]
  ];
  for (const [fg, bg] of uiPairs) {
    assert.ok(cr(fg, bg) >= 3.0, `UI contrast fail ${fg} on ${bg}: ${cr(fg, bg).toFixed(2)}`);
  }
}

// 3. Full interactive click-through of app.js (including Calendar manual shift dropdown & delete)
{
  function makeEl(id, tag = "div", attrsInit = {}) {
    const attrs = new Map(Object.entries(attrsInit));
    const listeners = {};
    let htmlStr = "";
    return {
      id,
      tagName: tag.toUpperCase(),
      textContent: "",
      get innerHTML() { return htmlStr; },
      set innerHTML(v) { htmlStr = String(v); if (htmlStr === "") this.children = []; },
      value: "",
      hidden: false,
      disabled: false,
      open: false,
      children: [],
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) { attrs.delete(k); },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      click(targetOverride) {
        if (!this.disabled) {
          (listeners.click || []).forEach((fn) => fn({ target: targetOverride || this, currentTarget: this }));
        }
      },
      input(val) { this.value = val; (listeners.input || []).forEach((fn) => fn({ target: this })); },
      appendChild(child) { this.children.push(child); return child; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      focus() {}
    };
  }

  const tabCalendar = makeEl("tab-calendar", "button", { "data-tab-target": "calendar" });
  const tabClock = makeEl("tab-clock", "button", { "data-tab-target": "clock" });
  const tabLogs = makeEl("tab-logs", "button", { "data-tab-target": "logs" });
  const chip0 = makeEl("rest-0", "button", { "data-rest-mins": "0" });
  const chip30 = makeEl("rest-30", "button", { "data-rest-mins": "30" });
  const chip60 = makeEl("rest-60", "button", { "data-rest-mins": "60" });

  const ids = [
    "meta-theme-color", "rate-chip", "theme-toggle", "storage-error", "storage-error-text",
    "reset-storage-btn", "live-date", "live-clock", "punch-btn", "punch-status",
    "card-in-time", "card-out-time", "card-timer", "card-earned", "card-formula",
    "card-rate-trigger", "view-calendar", "view-clock", "view-logs",
    "cal-prev", "cal-next", "cal-month-label", "cal-month-summary", "cal-grid",
    "cal-day-title", "cal-day-empty", "cal-day-list",
    "toggle-manual-btn", "manual-drawer", "manual-in", "manual-out", "manual-rest",
    "manual-preview", "manual-error", "cancel-manual-btn", "save-manual-btn",
    "log-loading", "log-empty", "log-list", "open-clear-btn",
    "rate-dialog", "hourly-rate", "rate-error", "close-rate-btn",
    "clear-dialog", "cancel-clear-btn", "confirm-clear-btn"
  ];
  const map = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
  map["manual-in"].value = "09:00";
  map["manual-out"].value = "18:00";
  map["manual-rest"].value = "60";

  const store = new Map();
  const docEl = makeEl("html", "html", { "data-theme": "dark" });

  const sandbox = {
    Date, Math, JSON, Number, String, Array, Object, Boolean, Error,
    location: { protocol: "file:", hostname: "" },
    navigator: { standalone: false },
    window: {
      WorkClockLogic: Logic,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
      }
    },
    document: {
      documentElement: docEl,
      getElementById: (id) => map[id] || null,
      querySelectorAll: (sel) => (sel === "[data-rest-mins]" ? [chip0, chip30, chip60] : [tabCalendar, tabClock, tabLogs]),
      createElement: (tag) => makeEl("", tag)
    }
  };

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), sandbox);

  // Set rate RM 20/hr
  map["hourly-rate"].input("20");

  // Open Calendar tab, open manual shift dropdown, test 30m chip + invalid time + valid 60m save
  tabCalendar.click();
  assert.equal(map["view-calendar"].hidden, false);
  map["toggle-manual-btn"].click();
  assert.equal(map["manual-drawer"].getAttribute("data-open"), "true");
  chip30.click();
  assert.equal(map["manual-rest"].value, "30");
  assert.ok(map["manual-preview"].textContent.includes("8.50 hrs"));
  chip60.click();
  assert.ok(map["manual-preview"].textContent.includes("8.00 hrs"));
  assert.ok(map["manual-preview"].textContent.includes("RM 160.00"));

  map["save-manual-btn"].click();
  assert.equal(map["manual-drawer"].getAttribute("data-open"), "false");
  assert.equal(map["cal-day-list"].children.length, 2);
  assert.ok(map["cal-month-summary"].textContent.includes("RM 160.00"));

  // Delete saved manual shift
  const outRow = map["cal-day-list"].children[1];
  const delBtn = outRow.children[1].children[1];
  assert.ok(delBtn.getAttribute("data-delete-pair"));
  map["cal-day-list"].click(delBtn);
  assert.equal(map["cal-day-empty"].hidden, false);
}

console.log("ALL TESTS PASSED");
