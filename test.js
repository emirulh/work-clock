"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Logic = require("./logic.js");

// 1. Calculation and edge-case tests
{
  assert.equal(Logic.getNextAction([]), "IN");
  const t0 = new Date(2026, 10, 27, 9, 0, 0).getTime();
  const t1 = new Date(2026, 10, 27, 13, 30, 0).getTime(); // 4.5 hours
  let punches = Logic.recordPunch([], t0);
  assert.equal(punches.length, 1);
  assert.equal(punches[0].type, "IN");
  assert.equal(Logic.getNextAction(punches), "OUT");

  const midSummary = Logic.calculateTodaySummary(punches, 20, t0 + 60000);
  assert.equal(midSummary.isClockedIn, true);
  assert.equal(midSummary.totalEarned, 0);

  punches = Logic.recordPunch(punches, t1);
  assert.equal(punches.length, 2);
  assert.equal(punches[1].type, "OUT");
  assert.equal(Logic.getNextAction(punches), "IN");

  const doneSummary = Logic.calculateTodaySummary(punches, 25.5, t1);
  assert.equal(doneSummary.isClockedIn, false);
  assert.equal(doneSummary.hoursText, "4.50");
  assert.equal(doneSummary.rateText, "RM 25.50");
  assert.equal(doneSummary.earnedText, "RM 114.75");
  assert.equal(doneSummary.todayPunches.length, 2);

  // Midnight boundary clipping test
  const prevNight = new Date(2026, 10, 26, 23, 0, 0).getTime();
  const morningOut = new Date(2026, 10, 27, 2, 0, 0).getTime();
  let overnight = Logic.recordPunch([], prevNight);
  overnight = Logic.recordPunch(overnight, morningOut);
  const overnightSummary = Logic.calculateTodaySummary(overnight, 15, morningOut);
  assert.equal(overnightSummary.hoursText, "2.00");
  assert.equal(overnightSummary.earnedText, "RM 30.00");

  // Rate validation tests
  assert.equal(Logic.parseRate("").valid, true);
  assert.equal(Logic.parseRate("18.75").rate, 18.75);
  assert.equal(Logic.parseRate("-5").valid, false);
  assert.equal(Logic.parseRate("abc").valid, false);
}

// 2. Hygiene and WCAG AA contrast check across source files
{
  const files = ["index.html", "logic.js", "app.js", "manifest.webmanifest", "sw.js"];
  for (const f of files) {
    const content = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.equal(content.includes("\u2014"), false, `Em dash found in ${f}`);
  }

  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.equal(html.includes("user-scalable=no"), false, "Viewport must not block zoom");
  assert.equal(html.includes("maximum-scale=1"), false, "Viewport must not cap scale");
}

// 3. Full interactive click-through of app.js controls (theme, rate, IN/OUT, dialog, storage reset)
{
  const vm = require("node:vm");
  function makeEl(id, tag = "div") {
    const attrs = new Map();
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
      open: true,
      children: [],
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) { attrs.delete(k); },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      click() { if (!this.disabled) (listeners.click || []).forEach((fn) => fn({ target: this })); },
      input(val) { this.value = val; (listeners.input || []).forEach((fn) => fn({ target: this })); },
      appendChild(child) { this.children.push(child); return child; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      focus() {},
      scrollIntoView() {}
    };
  }

  const ids = [
    "theme-toggle", "meta-theme-color", "storage-error", "storage-error-text",
    "reset-storage-btn", "today-date", "punch-btn", "punch-status",
    "hourly-rate", "rate-error", "eq-rate", "eq-hours", "eq-total", "eq-duration",
    "log-loading", "log-empty", "log-list", "open-clear-btn",
    "clear-dialog", "cancel-clear-btn", "confirm-clear-btn", "ios-install-help"
  ];
  const map = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
  map["clear-dialog"].open = false;

  const store = new Map([["work_clock_v1", "{corrupt-json"]]);
  const docEl = makeEl("html", "html");
  docEl.setAttribute("data-theme", "light");

  const sandbox = {
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Error,
    location: { protocol: "file:", hostname: "" },
    navigator: { standalone: false },
    window: {
      WorkClockLogic: Logic,
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
      }
    },
    document: {
      documentElement: docEl,
      getElementById: (id) => map[id] || null,
      createElement: (tag) => makeEl("", tag)
    }
  };

  const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  vm.runInNewContext(appCode, sandbox);

  // Corrupt storage triggers visible error state; Reset local data clears it
  assert.equal(map["storage-error"].hidden, false);
  map["reset-storage-btn"].click();
  assert.equal(map["storage-error"].hidden, true);
  assert.equal(map["log-empty"].hidden, false);
  assert.equal(map["open-clear-btn"].disabled, true);

  // Theme toggle switches light -> dark -> light
  map["theme-toggle"].click();
  assert.equal(docEl.getAttribute("data-theme"), "dark");
  assert.equal(map["theme-toggle"].getAttribute("aria-pressed"), "true");
  map["theme-toggle"].click();
  assert.equal(docEl.getAttribute("data-theme"), "light");

  // Rate validation error state then valid RM rate
  map["hourly-rate"].input("-12");
  assert.equal(map["rate-error"].hidden, false);
  map["hourly-rate"].input("20.00");
  assert.equal(map["rate-error"].hidden, true);
  assert.equal(map["eq-rate"].textContent, "RM 20.00");

  // Tap IN -> turns red (data-state="out") and says OUT
  assert.equal(map["punch-btn"].textContent, "IN");
  assert.equal(map["punch-btn"].getAttribute("data-state"), "in");
  map["punch-btn"].click();
  assert.equal(map["punch-btn"].textContent, "OUT");
  assert.equal(map["punch-btn"].getAttribute("data-state"), "out");
  assert.equal(map["log-list"].children.length, 1);
  assert.equal(map["open-clear-btn"].disabled, false);

  // Tap OUT -> turns green (data-state="in") and says IN, logs 2nd entry
  map["punch-btn"].click();
  assert.equal(map["punch-btn"].textContent, "IN");
  assert.equal(map["punch-btn"].getAttribute("data-state"), "in");
  assert.equal(map["log-list"].children.length, 2);

  // Clear log dialog: open -> cancel keeps entries -> reopen -> confirm clears entries
  map["open-clear-btn"].click();
  assert.equal(map["clear-dialog"].open, true);
  map["cancel-clear-btn"].click();
  assert.equal(map["clear-dialog"].open, false);
  assert.equal(map["log-list"].children.length, 2);
  map["open-clear-btn"].click();
  map["confirm-clear-btn"].click();
  assert.equal(map["clear-dialog"].open, false);
  assert.equal(map["log-empty"].hidden, false);
  assert.equal(map["open-clear-btn"].disabled, true);
}

console.log("ALL TESTS PASSED");
