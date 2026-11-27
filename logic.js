(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WorkClockLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseRate(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      return { valid: true, rate: 0, empty: true, error: "" };
    }
    var num = Number(String(raw).trim());
    if (!Number.isFinite(num) || num < 0 || num > 100000) {
      return {
        valid: false,
        rate: 0,
        empty: false,
        error: "Hourly rate must be between RM 0.00 and RM 100000.00."
      };
    }
    return {
      valid: true,
      rate: Math.round(num * 100) / 100,
      empty: false,
      error: ""
    };
  }

  function getNextAction(punches) {
    if (!Array.isArray(punches) || punches.length === 0) {
      return "IN";
    }
    var last = punches[punches.length - 1];
    return last && last.type === "IN" ? "OUT" : "IN";
  }

  function recordPunch(punches, nowMs) {
    var list = Array.isArray(punches) ? punches.slice() : [];
    var ts = typeof nowMs === "number" ? nowMs : Date.now();
    var nextType = getNextAction(list);
    list.push({
      id: String(ts) + "-" + String(list.length),
      type: nextType,
      ms: ts,
      iso: new Date(ts).toISOString()
    });
    return list;
  }

  function getDayBounds(nowMs) {
    var d = new Date(nowMs);
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
    return { startMs: start, endMs: end };
  }

  function formatHours(hours) {
    if (!hours || hours <= 0) {
      return "0.00";
    }
    // Keep 4 decimals under 36s so short prototype test punches show real pay.
    if (hours < 0.01) {
      return hours.toFixed(4);
    }
    return hours.toFixed(2);
  }

  function formatRM(amount) {
    var safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
    return "RM " + safe.toFixed(2);
  }

  function formatDurationExact(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    return h + "h " + m + "m " + s + "s";
  }

  function calculateTodaySummary(punches, rate, nowMs) {
    var list = Array.isArray(punches) ? punches : [];
    var safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    var bounds = getDayBounds(typeof nowMs === "number" ? nowMs : Date.now());
    var openIn = null;
    var completedMs = 0;
    var pairDurationsByOutId = {};

    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || typeof entry.ms !== "number") {
        continue;
      }
      if (entry.type === "IN") {
        openIn = entry;
      } else if (entry.type === "OUT" && openIn !== null) {
        var totalPairMs = Math.max(0, entry.ms - openIn.ms);
        pairDurationsByOutId[entry.id] = totalPairMs;
        var clippedStart = Math.max(openIn.ms, bounds.startMs);
        var clippedEnd = Math.min(entry.ms, bounds.endMs);
        if (clippedEnd > clippedStart) {
          completedMs += clippedEnd - clippedStart;
        }
        openIn = null;
      }
    }

    var todayPunches = [];
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (item && typeof item.ms === "number" && item.ms >= bounds.startMs && item.ms < bounds.endMs) {
        todayPunches.push({
          id: item.id,
          type: item.type,
          ms: item.ms,
          iso: item.iso,
          shiftMs: item.type === "OUT" ? (pairDurationsByOutId[item.id] || 0) : null
        });
      }
    }

    var hoursWorked = completedMs / 3600000;
    var totalEarned = Math.round(safeRate * hoursWorked * 100) / 100;

    return {
      isClockedIn: openIn !== null,
      activeSinceMs: openIn ? openIn.ms : null,
      completedMs: completedMs,
      completedExactText: formatDurationExact(completedMs),
      hoursWorked: hoursWorked,
      hoursText: formatHours(hoursWorked),
      rateText: formatRM(safeRate),
      totalEarned: totalEarned,
      earnedText: formatRM(totalEarned),
      todayPunches: todayPunches
    };
  }

  return {
    parseRate: parseRate,
    getNextAction: getNextAction,
    recordPunch: recordPunch,
    getDayBounds: getDayBounds,
    formatHours: formatHours,
    formatRM: formatRM,
    formatDurationExact: formatDurationExact,
    calculateTodaySummary: calculateTodaySummary
  };
});
