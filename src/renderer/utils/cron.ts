export function formatKoreanTime(hourText: string, minuteText: string): string | undefined {
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  if (hour === 0 && minute === 0) {
    return "자정";
  }

  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${period} ${displayHour}:${minute.toString().padStart(2, "0")}`;
}

export function describeDayOfWeek(field: string): string | undefined {
  const normalized = field.toUpperCase();
  const days: Record<string, string> = {
    "0": "일요일",
    "1": "월요일",
    "2": "화요일",
    "3": "수요일",
    "4": "목요일",
    "5": "금요일",
    "6": "토요일",
    "7": "일요일",
    SUN: "일요일",
    MON: "월요일",
    TUE: "화요일",
    WED: "수요일",
    THU: "목요일",
    FRI: "금요일",
    SAT: "토요일"
  };

  if (days[normalized]) {
    return `매주 ${days[normalized]}`;
  }

  if (normalized === "1-5" || normalized === "MON-FRI") {
    return "월요일부터 금요일까지";
  }

  return undefined;
}

export function describeCronSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);

  if (parts.length !== 5) {
    return "설명할 수 없는 cron 표현식";
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const time = formatKoreanTime(hour, minute);

  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `${minute.slice(2)}분마다`;
  }

  if (minute === "0" && hour.startsWith("*/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `${hour.slice(2)}시간마다 정각`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `매일 ${time}`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const day = describeDayOfWeek(dayOfWeek);

    return day ? `${day} ${time}` : "설명할 수 없는 cron 표현식";
  }

  if (time && dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    if (dayOfMonth.startsWith("*/")) {
      return `${dayOfMonth.slice(2)}일마다 ${time}`;
    }

    return `매월 ${dayOfMonth}일 ${time}`;
  }

  if (time && dayOfMonth !== "*" && month !== "*" && dayOfWeek === "*") {
    return `매년 ${month}월 ${dayOfMonth}일 ${time}`;
  }

  if (minute.includes(",") && hour.includes(",") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const times = hour.split(",").map((hourPart) => formatKoreanTime(hourPart, minute.split(",")[0])).filter(Boolean);

    return times.length > 0 ? `매일 ${times.join(" 및 ")}` : "설명할 수 없는 cron 표현식";
  }

  if (time && hour.includes("-") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `매일 ${hour.replace("-", "시부터 ")}시까지 매시간`;
  }

  if (minute.startsWith("*/") && hour.includes("-") && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const day = describeDayOfWeek(dayOfWeek);

    return day ? `${day} ${hour.replace("-", "시부터 ")}시까지 ${minute.slice(2)}분마다` : "설명할 수 없는 cron 표현식";
  }

  return "설명할 수 없는 cron 표현식";
}

export function scheduleWithDescription(schedule: string, timeZone?: string): string {
  const description = describeCronSchedule(schedule);

  return timeZone ? `${description}, ${timeZone}` : description;
}
