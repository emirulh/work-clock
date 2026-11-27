"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Logic = require("./logic.js");

// 1. Calculation, live timer, midnight clipping, and monthly calendar tests
{
  assert.equal(Logic.getNextAction([]), "IN");
  const t0 = new Date(2026, 10, 28, 9, 0, 0).getTime();
  const tMid = new Date(2026, 10, 28, 10, 30, 15).getTime();
  const t1 = new Date(2026, 10, 28, 13, 30, 0).getTime(); // 4.5 hours

  let punches = Logic.recordPunch([], t0);
  const live = Logic.calculateTodaySummary(punches, 20, tMid);
  assert.equal(live.isClockedIn, true);
  assert.equal(live.liveHms, "01:30:15");
  assert.equal(live.earnedText, "RM 30.08");

  punches = Logic.recordPunch(punches, t1);
  const done = Logic.calculateTodaySummary(punches, 25.5, t1);
  assert.equal(done.isClockedIn, false);
  assert.equal(done.liveHms, "04:30:00");
  assert.equal(done.hoursText, "4.50");
  assert.equal(done.earnedText, "RM 114.75");

  const month = Logic.getMonthSummary(punches, 25.5, 2026, 10, t1);
  assert.equal(month.daysInMonth, 30);
  assert.equal(month.days[27].hasPunches, true);
  assert.equal(month.days[27].earnedText, "RM 114.75");
  assert.equal(month.monthEarnedText, "RM 114.75");

  assert.equal(Logic.parseRate("-5").valid, false);
  assert.equal(Logic.parseRate("20.5").rate, 20.5);
}

// 2. Hygiene & WCAG AA contrast verification across both dark and light themes
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
    ["#F5F5F5", "#171717"], ["#F5F5F5", "#242424"], ["#B8B8C0", "#242424"],
    ["#FFFFFF", "#354F1A"], ["#FFFFFF", "#B91C1C"], ["#171717", "#F5F5F5"],
    ["#FCA5A5", "#2A1215"], ["#18181B", "#F6F4EF"], ["#52525B", "#FFFFFF"],
    ["#991B1B", "#FEF2F2"]
  ];
  for (const [fg, bg] of textPairs) {
    assert.ok(cr(fg, bg) >= 4.5, `Text contrast fail ${fg} on ${bg}: ${cr(fg, bg).toFixed(2)}`);
  }
  const uiPairs = [
    ["#8A8A94", "#171717"], ["#8A8A94", "#242424"], ["#A3E635", "#171717"],
    ["#FCA5A5", "#171717"], ["#71717A", "#FFFFFF"], ["#1D4ED8", "#FFFFFF"]
  ];
  for (const [fg, bg] of uiPairs) {
    assert.ok(cr(fg, bg) >= 3.0, `UI contrast fail ${fg} on ${bg}: ${cr(fg, bg).toFixed(2)}`);
  }
}

// 3. Full interactive click-through of app.js (tabs, rate modal, IN/OUT, calendar, clear dialog, theme)
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

  const ids = [
    "meta-theme-color", "rate-chip", "theme-toggle", "storage-error", "storage-error-text",
    "reset-storage-btn", "live-date", "live-clock", "punch-btn", "punch-status",
    "card-in-time", "card-out-time", "card-timer", "card-earned", "card-formula",
    "card-rate-trigger", "view-calendar", "view-clock", "view-logs",
    "cal-prev", "cal-next", "cal-month-label", "cal-month-summary", "cal-grid",
    "cal-day-title", "cal-day-empty", "cal-day-list",
    "log-loading", "log-empty", "log-list", "open-clear-btn",
    "rate-dialog", "hourly-rate", "rate-error", "close-rate-btn",
    "clear-dialog", "cancel-clear-btn", "confirm-clear-btn"
  ];
  const map = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
  const store = new Map([["work_clock_v1", "{bad-json"]]);
  const docEl = makeEl("html", "html", { "data-theme": "dark" });

  const sandbox = {
    Date, Math, JSON, Number, String, Array, Object, Error,
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
      querySelectorAll: () => [tabCalendar, tabClock, tabLogs],
      createElement: (tag) => makeEl("", tag)
    }
  };

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), sandbox);

  // Storage error recovery
  assert.equal(map["storage-error"].hidden, false);
  map["reset-storage-btn"].click();
  assert.equal(map["storage-error"].hidden, true);

  // Theme toggle dark -> light -> dark
  assert.equal(docEl.getAttribute("data-theme"), "dark");
  map["theme-toggle"].click();
  assert.equal(docEl.getAttribute("data-theme"), "light");
  map["theme-toggle"].click();
  assert.equal(docEl.getAttribute("data-theme"), "dark");

  // Rate modal open, invalid rate error, valid rate RM 25.00, close
  map["rate-chip"].click();
  assert.equal(map["rate-dialog"].open, true);
  map["hourly-rate"].input("-5");
  assert.equal(map["rate-error"].hidden, false);
  map["hourly-rate"].input("25");
  assert.equal(map["rate-error"].hidden, true);
  assert.equal(map["rate-chip"].textContent, "RM 25.00/hr");
  map["close-rate-btn"].click();
  assert.equal(map["rate-dialog"].open, false);

  // Punch IN -> red OUT -> Punch OUT -> green IN
  map["punch-btn"].click();
  assert.equal(map["punch-btn"].textContent, "OUT");
  assert.equal(map["punch-btn"].getAttribute("data-state"), "out");
  map["punch-btn"].click();
  assert.equal(map["punch-btn"].textContent, "IN");
  assert.equal(map["punch-btn"].getAttribute("data-state"), "in");

  // Switch to Calendar tab and navigate months
  tabCalendar.click();
  assert.equal(map["view-calendar"].hidden, false);
  assert.equal(map["view-clock"].hidden, true);
  const firstMonth = map["cal-month-label"].textContent;
  map["cal-prev"].click();
  assert.notEqual(map["cal-month-label"].textContent, firstMonth);
  map["cal-next"].click();
  assert.equal(map["cal-month-label"].textContent, firstMonth);

  // Switch to Logs tab and verify Clear dialog cancel + confirm
  tabLogs.click();
  assert.equal(map["view-logs"].hidden, false);
  assert.equal(map["log-list"].children.length, 2);
  map["open-clear-btn"].click();
  assert.equal(map["clear-dialog"].open, true);
  map["cancel-clear-btn"].click();
  assert.equal(map["log-list"].children.length, 2);
  map["open-clear-btn"].click();
  map["confirm-clear-btn"].click();
  assert.equal(map["log-empty"].hidden, false);
  assert.equal(map["open-clear-btn"].disabled, true);
}

console.log("ALL TESTS PASSED");
