export type BusinessHour = {
  weekday: number;
  startMinute: number | null;
  endMinute: number | null;
  isClosed: boolean;
};

export function formatBusinessTime(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    return "";
  }
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseBusinessTime(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  let hours: number;
  let minutes: number;
  if (normalized.includes(":")) {
    const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error("Use a time such as 08:00 or 17:00.");
    hours = Number(match[1]);
    minutes = Number(match[2]);
  } else {
    if (!/^\d{3,4}$/.test(normalized)) {
      throw new Error("Use a time such as 0800, 800, or 08:00.");
    }
    const padded = normalized.padStart(4, "0");
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2));
  }

  if (hours > 23 || minutes > 59) {
    throw new Error("Enter a valid 24-hour time between 00:00 and 23:59.");
  }
  return hours * 60 + minutes;
}

export function weekdayHours(openDays: number[], startMinute = 8 * 60, endMinute = 17 * 60): BusinessHour[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startMinute: openDays.includes(weekday) ? startMinute : null,
    endMinute: openDays.includes(weekday) ? endMinute : null,
    isClosed: !openDays.includes(weekday),
  }));
}
