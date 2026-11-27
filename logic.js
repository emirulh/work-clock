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

  function parseTimeParts(timeStr) {
    if (typeof timeStr !== "string") {
      return null;
    }
    var match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return null;
    }
    var h = Number(match[1]);
    var m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return { h: h, m: m };
  }

  function parseRestMinutes(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      return { valid: true, mins: 0, error: "" };
    }
    var n = Number(String(raw).trim());
    if (!Number.isFinite(n) || n < 0 || n > 720) {
      return { valid: false, mins: 0, error: "Resting time must be between 0 and 720 minutes." };
    }
    return { valid: true, mins: Math.round(n), error: "" };
  }

  function previewManualShift(inTimeStr, outTimeStr, restRaw, rate) {
    var inParts = parseTimeParts(inTimeStr);
    var outParts = parseTimeParts(outTimeStr);
    if (!inParts || !outParts) {
      return { valid: false, error: "Enter valid Time IN and Time OUT.", netMs: 0, netHms: "00:00:00", hoursText: "0.00", earnedText: "RM 0.00" };
    }
    var restCheck = parseRestMinutes(restRaw);
    if (!restCheck.valid) {
      return { valid: false, error: restCheck.error, netMs: 0, netHms: "00:00:00", hoursText: "0.00", earnedText: "RM 0.00" };
    }
    var inMin = inParts.h * 60 + inParts.m;
    var outMin = outParts.h * 60 + outParts.m;
    if (outMin <= inMin) {
      return { valid: false, error: "Time OUT must be later than Time IN.", netMs: 0, netHms: "00:00:00", hoursText: "0.00", earnedText: "RM 0.00" };
    }
    var grossMin = outMin - inMin;
    if (restCheck.mins >= grossMin) {
      return { valid: false, error: "Resting time must be shorter than the shift.", netMs: 0, netHms: "00:00:00", hoursText: "0.00", earnedText: "RM 0.00" };
    }
    var netMs = (grossMin - restCheck.mins) * 60000;
    var safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    var hours = netMs / 3600000;
    var earned = Math.round(safeRate * hours * 100) / 100;
    return {
      valid: true,
      error: "",
      restMs: restCheck.mins * 60000,
      restMins: restCheck.mins,
      netMs: netMs,
      netHms: formatHms(netMs),
      hoursText: formatHours(hours),
      earnedText: formatRM(earned)
    };
  }

  function addManualShift(punches, year, month, day, inTimeStr, outTimeStr, restRaw) {
    var check = previewManualShift(inTimeStr, outTimeStr, restRaw, 0);
    if (!check.valid) {
      return { valid: false, error: check.error, punches: punches };
    }
    var inParts = parseTimeParts(inTimeStr);
    var outParts = parseTimeParts(outTimeStr);
    var inMs = new Date(year, month, day, inParts.h, inParts.m, 0, 0).getTime();
    var outMs = new Date(year, month, day, outParts.h, outParts.m, 0, 0).getTime();
    var pairId = "m-" + String(inMs) + "-" + String(Date.now());
    var list = Array.isArray(punches) ? punches.slice() : [];
    list.push({
      id: pairId + "-in",
      type: "IN",
      ms: inMs,
      iso: new Date(inMs).toISOString(),
      manual: true,
      pairId: pairId
    });
    list.push({
      id: pairId + "-out",
      type: "OUT",
      ms: outMs,
      iso: new Date(outMs).toISOString(),
      manual: true,
      pairId: pairId,
      restMs: check.restMs
    });
    list.sort(function (a, b) {
      return a.ms - b.ms;
    });
    return { valid: true, error: "", punches: list, pairId: pairId };
  }

  function deleteShiftByPairId(punches, pairId) {
    if (!Array.isArray(punches) || !pairId) {
      return Array.isArray(punches) ? punches.slice() : [];
    }
    return punches.filter(function (item) {
      return !item || item.pairId !== pairId;
    });
  }

  function getDayBounds(nowMs) {
    var d = new Date(nowMs);
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
    return { startMs: start, endMs: end };
  }

  function pad2(n) {
    return n < 10 ? "0" + String(n) : String(n);
  }

  function formatHms(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  function formatHours(hours) {
    if (!hours || hours <= 0) {
      return "0.00";
    }
    // Keep 4 decimals under 36s so quick prototype test punches show real pay.
    if (hours < 0.01) {
      return hours.toFixed(4);
    }
    return hours.toFixed(2);
  }

  function formatRM(amount) {
    var safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
    return "RM " + safe.toFixed(2);
  }

  function calculateDaySummary(punches, rate, dayMs, nowMs) {
    var list = Array.isArray(punches) ? punches : [];
    var safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    var refNow = typeof nowMs === "number" ? nowMs : Date.now();
    var bounds = getDayBounds(typeof dayMs === "number" ? dayMs : refNow);
    var openIn = null;
    var completedMs = 0;
    var latestInMs = null;
    var latestOutMs = null;

    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || typeof entry.ms !== "number") {
        continue;
      }
      if (entry.type === "IN") {
        openIn = entry;
        if (entry.ms >= bounds.startMs && entry.ms < bounds.endMs) {
          latestInMs = entry.ms;
        }
      } else if (entry.type === "OUT" && openIn !== null) {
        var clippedStart = Math.max(openIn.ms, bounds.startMs);
        var clippedEnd = Math.min(entry.ms, bounds.endMs);
        if (clippedEnd > clippedStart) {
          var restDeduction = Number.isFinite(entry.restMs) && entry.restMs > 0 ? entry.restMs : 0;
          completedMs += Math.max(0, (clippedEnd - clippedStart) - restDeduction);
        }
        if (entry.ms >= bounds.startMs && entry.ms < bounds.endMs) {
          latestOutMs = entry.ms;
        }
        openIn = null;
      }
    }

    var activeMs = 0;
    if (openIn !== null) {
      var activeStart = Math.max(openIn.ms, bounds.startMs);
      var activeEnd = Math.min(refNow, bounds.endMs);
      if (activeEnd > activeStart) {
        activeMs = activeEnd - activeStart;
      }
    }

    var dayPunches = [];
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (item && typeof item.ms === "number" && item.ms >= bounds.startMs && item.ms < bounds.endMs) {
        dayPunches.push({
          id: item.id,
          type: item.type,
          ms: item.ms,
          iso: item.iso,
          manual: Boolean(item.manual),
          pairId: item.pairId || null,
          restMs: Number.isFinite(item.restMs) && item.restMs > 0 ? item.restMs : 0
        });
      }
    }

    var totalMs = completedMs + activeMs;
    var completedHours = completedMs / 3600000;
    var liveHours = totalMs / 3600000;
    var completedEarned = Math.round(safeRate * completedHours * 100) / 100;
    var liveEarned = Math.round(safeRate * liveHours * 100) / 100;

    return {
      isClockedIn: openIn !== null,
      activeSinceMs: openIn ? openIn.ms : null,
      latestInMs: latestInMs,
      latestOutMs: latestOutMs,
      completedMs: completedMs,
      totalMs: totalMs,
      liveHms: formatHms(totalMs),
      hoursWorked: completedHours,
      liveHoursWorked: liveHours,
      hoursText: formatHours(liveHours),
      rateText: formatRM(safeRate),
      totalEarned: completedEarned,
      liveEarned: liveEarned,
      earnedText: formatRM(liveEarned),
      dayPunches: dayPunches
    };
  }

  function calculateTodaySummary(punches, rate, nowMs) {
    var ts = typeof nowMs === "number" ? nowMs : Date.now();
    return calculateDaySummary(punches, rate, ts, ts);
  }

  function getMonthSummary(punches, rate, year, month, nowMs) {
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var firstWeekday = new Date(year, month, 1).getDay();
    var days = [];
    var monthTotalMs = 0;
    var monthTotalEarned = 0;

    for (var d = 1; d <= daysInMonth; d++) {
      var dayMid = new Date(year, month, d, 12, 0, 0, 0).getTime();
      var summary = calculateDaySummary(punches, rate, dayMid, nowMs);
      monthTotalMs += summary.totalMs;
      monthTotalEarned += summary.liveEarned;
      days.push({
        day: d,
        dayMs: dayMid,
        hasPunches: summary.dayPunches.length > 0 || summary.totalMs > 0,
        totalMs: summary.totalMs,
        hms: summary.liveHms,
        earnedText: summary.earnedText,
        punches: summary.dayPunches
      });
    }

    return {
      year: year,
      month: month,
      firstWeekday: firstWeekday,
      daysInMonth: daysInMonth,
      days: days,
      monthHoursText: formatHours(monthTotalMs / 3600000),
      monthEarnedText: formatRM(Math.round(monthTotalEarned * 100) / 100)
    };
  }

  return {
    parseRate: parseRate,
    getNextAction: getNextAction,
    recordPunch: recordPunch,
    previewManualShift: previewManualShift,
    addManualShift: addManualShift,
    deleteShiftByPairId: deleteShiftByPairId,
    getDayBounds: getDayBounds,
    formatHms: formatHms,
    formatHours: formatHours,
    formatRM: formatRM,
    calculateDaySummary: calculateDaySummary,
    calculateTodaySummary: calculateTodaySummary,
    getMonthSummary: getMonthSummary
  };
});
