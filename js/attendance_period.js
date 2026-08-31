(function (root) {
  'use strict';

  const DAY_MS = 86400000;

  function isoDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  function fromIso(value) {
    const [year, month, day] = String(value || '').split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function addDays(value, amount) {
    return isoDate(new Date(fromIso(value).getTime() + amount * DAY_MS));
  }

  function monthRange(anchor, offset, throughAnchor) {
    const date = fromIso(anchor);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12));
    const end = throughAnchor
      ? fromIso(anchor)
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
    return { from: isoDate(start), to: isoDate(end) };
  }

  function range(preset, anchor) {
    const today = anchor || isoDate(new Date());
    if (preset === 'today') return { from: today, to: today };
    if (preset === 'week') {
      const day = fromIso(today).getUTCDay() || 7;
      return { from: addDays(today, 1 - day), to: day === 7 ? addDays(today, -1) : today };
    }
    if (preset === 'previous_week') {
      const day = fromIso(today).getUTCDay() || 7;
      const monday = addDays(today, 1 - day);
      return { from: addDays(monday, -7), to: addDays(monday, -2) };
    }
    if (preset === 'previous_month') return monthRange(today, -1, false);
    return monthRange(today, 0, true);
  }

  function normalize(from, to) {
    if (!from || !to) return null;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  const api = { isoDate, range, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AttendancePeriod = api;
})(typeof window !== 'undefined' ? window : globalThis);
