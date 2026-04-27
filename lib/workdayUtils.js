export const DEFAULT_BREAK_MINUTES = 30;

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function getNowTimeString(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function timestampToDate(value) {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

export function getDateKeyFromWorkday(id, data) {
  return String(data?.dateKey || data?.date || id || "");
}

export function timeStringToDate(dateKey, timeString) {
  if (!dateKey || !timeString) return null;

  const parts = String(timeString).split(":");
  if (parts.length < 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  d.setHours(h, m, 0, 0);
  return d;
}

export function getStartDate(id, data) {
  const dateKey = getDateKeyFromWorkday(id, data);
  return timestampToDate(data?.startAt) || timeStringToDate(dateKey, data?.startTime);
}

export function getEndDate(id, data) {
  const dateKey = getDateKeyFromWorkday(id, data);
  return timestampToDate(data?.endAt) || timeStringToDate(dateKey, data?.endTime);
}

export function getBreakStartDate(id, data) {
  const dateKey = getDateKeyFromWorkday(id, data);
  return timestampToDate(data?.breakStartAt) || timeStringToDate(dateKey, data?.breakStartTime);
}

export function getBreakEndDate(id, data) {
  const dateKey = getDateKeyFromWorkday(id, data);
  return timestampToDate(data?.breakEndAt) || timeStringToDate(dateKey, data?.breakEndTime);
}

export function formatTime(value) {
  const d = timestampToDate(value);
  if (!d) return "-";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatTimeFromWorkday(id, data, fieldName) {
  const dateKey = getDateKeyFromWorkday(id, data);

  if (fieldName === "start") {
    return formatTime(data?.startAt) !== "-"
      ? formatTime(data?.startAt)
      : data?.startTime || "-";
  }

  if (fieldName === "breakStart") {
    return formatTime(data?.breakStartAt) !== "-"
      ? formatTime(data?.breakStartAt)
      : data?.breakStartTime || "-";
  }

  if (fieldName === "breakEnd") {
    return formatTime(data?.breakEndAt) !== "-"
      ? formatTime(data?.breakEndAt)
      : data?.breakEndTime || "-";
  }

  if (fieldName === "end") {
    return formatTime(data?.endAt) !== "-"
      ? formatTime(data?.endAt)
      : data?.endTime || "-";
  }

  return "-";
}

export function statusLabel(status) {
  const value = String(status || "").toLowerCase();

  if (value === "started") return "В работе";
  if (value === "break") return "На перерыве";
  if (value === "ended") return "Завершён";

  return "Не начат";
}

export function calculateWorkMinutes(id, data) {
  const start = getStartDate(id, data);
  const end = getEndDate(id, data);

  if (!start || !end) return 0;

  let total = Math.round((end.getTime() - start.getTime()) / 60000);
  if (total < 0) total = 0;

  const breakStart = getBreakStartDate(id, data);
  const breakEnd = getBreakEndDate(id, data);

  if (breakStart && breakEnd) {
    const breakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
    total -= Math.max(0, breakMinutes);
  } else {
    const defaultBreak = Number(data?.defaultBreakMinutes ?? DEFAULT_BREAK_MINUTES);
    total -= Math.max(0, defaultBreak);
  }

  return Math.max(0, total);
}

export function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}ч ${m}м`;
}

export function normalizeWorkday(id, data) {
  const dateKey = getDateKeyFromWorkday(id, data);

  return {
    id,
    dateKey,
    status: String(data?.status || ""),
    statusText: statusLabel(data?.status),
    objectId: String(data?.objectId || ""),
    objectName: String(data?.objectName || ""),
    startText: formatTimeFromWorkday(id, data, "start"),
    breakStartText: formatTimeFromWorkday(id, data, "breakStart"),
    breakEndText: formatTimeFromWorkday(id, data, "breakEnd"),
    endText: formatTimeFromWorkday(id, data, "end"),
    totalMinutes: calculateWorkMinutes(id, data),
    totalText: formatMinutes(calculateWorkMinutes(id, data)),
    raw: data || {},
  };
}

export function sortWorkdaysDesc(a, b) {
  return String(b.dateKey || b.id || "").localeCompare(String(a.dateKey || a.id || ""));
}

export function getMonthKey(dateKey) {
  return String(dateKey || "").slice(0, 7);
}

export function monthLabel(monthKey) {
  if (!monthKey) return "-";

  const [y, m] = String(monthKey).split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);

  if (Number.isNaN(date.getTime())) return monthKey;

  return date.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}
