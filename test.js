"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Logic = require("./logic.js");

// 1. Calculation, date grouping, edit, delete, and rest deduction tests
{
  const day27In = new Date(2026, 10, 27, 16, 30, 0).getTime();
  const day27Out = new Date(2026, 10, 27, 22, 30, 0).getTime();
  let punches = [];
  const added27 = Logic.addManualShift(punches, 2026, 10, 27, "16:30", "22:30", 30);
  assert.equal(added27.valid, true);
  punches = added27.punches;

  const added28 = Logic.addManualShift(punches, 2026, 10, 28, "09:00", "17:00", 60);
  assert.equal(added28.valid, true);
  punches = added28.punches;

  // Date grouping: 2 distinct sections, newest first (28th then 27th)
  const groups = Logic.groupPunchesByDate(punches, 20, day27Out);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].dateKey, "2026-11-28");
  assert.equal(groups[0].hms, "07:00:00");
  assert.equal(groups[0].earnedText, "RM 140.00");
  assert.equal(groups[1].dateKey, "2026-11-27");
  assert.equal(groups[1].hms, "05:30:00");
  assert.equal(groups[1].earnedText, "RM 110.00");

  // Edit single OUT punch time & rest minutes
  const out27 = groups[1].punches.find((p) => p.type === "OUT");
  const edited = Logic.updatePunchById(punches, out27.id, "2026-11-27", "23:30", "60");
  assert.equal(edited.valid, true);
  const groupsAfterEdit = Logic.groupPunchesByDate(edited.punches, 20, day27Out);
  assert.equal(groupsAfterEdit[1].hms, "06:00:00");
  assert.equal(groupsAfterEdit[1].earnedText, "RM 120.00");

  // Delete single punch by ID
  const afterDelete = Logic.deletePunchById(edited.punches, out27.id);
  assert.equal(afterDelete.length, 3);
  assert.ok(day27In < day27Out);
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
    ["#FFFFFF", "#354F1A"], ["#FFFFFF", "#B91C1C"], ["#FFFFFF", "#1D4ED8"],
    ["#111214", "#F5F5F7"], ["#FCA5A5", "#2A1215"], ["#18181B", "#F2F2F7"],
    ["#52525B", "#FFFFFF"], ["#991B1B", "#FEF2F2"]
  ];
  for (const [fg, bg] of textPairs) {
    assert.ok(cr(fg, bg) >= 4.5, `Text contrast fail ${fg} on ${bg}: ${cr(fg, bg).toFixed(2)}`);
  }
}

// 3. Full interactive click-through of grouped logs + swipe reveal + Edit modal + Delete
{
  function makeEl(id, tag = "div", attrsInit = {}) {
    const attrs = new Map(Object.entries(attrsInit));
    const listeners = {};
    let htmlStr = "";
    return {
      id,
      tagName: tag.toUpperCase(),
      textContent: "",
      style: {},
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
    "log-loading", "log-empty", "log-groups", "open-clear-btn",
    "rate-dialog", "hourly-rate", "rate-error", "close-rate-btn",
    "edit-punch-dialog", "edit-punch-title", "edit-punch-date", "edit-punch-time",
    "edit-rest-wrap", "edit-punch-rest", "edit-punch-error", "cancel-edit-btn", "save-edit-btn",
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

  map["hourly-rate"].input("20");
  tabCalendar.click();
  map["toggle-manual-btn"].click();
  map["save-manual-btn"].click();

  // Verify grouped logs section renders and swipe Edit/Delete actions work
  tabLogs.click();
  assert.equal(map["log-groups"].children.length, 1);
  const firstList = map["log-groups"].children[0].children[1];
  assert.equal(firstList.children.length, 2);
  const firstRow = firstList.children[0];
  const editBtn = firstRow.children[0].children[0];
  const delBtn = firstRow.children[0].children[1];

  map["log-groups"].click(editBtn);
  assert.equal(map["edit-punch-dialog"].open, true);
  map["edit-punch-time"].value = "17:00";
  map["save-edit-btn"].click();
  assert.equal(map["edit-punch-dialog"].open, false);

  map["log-groups"].click(delBtn);
  assert.equal(map["log-groups"].children[0].children[1].children.length, 1);
}

console.log("ALL TESTS PASSED");
