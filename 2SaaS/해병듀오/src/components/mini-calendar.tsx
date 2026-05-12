"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/mock-data";

type Props = {
  events: CalendarEvent[];
  today: string;
  onDayClick?: (date: string) => void;
  /** 셀 안에 이벤트 이름 표시 (Google 캘린더 스타일). 기본 false=점 표시 */
  labelMode?: boolean;
};

const eventTone: Record<CalendarEvent["type"], string> = {
  milestone: "bg-info",
  meeting: "bg-violet-500",
  report: "bg-success",
};

const eventLabel: Record<CalendarEvent["type"], string> = {
  milestone: "돌방",
  meeting: "미팅",
  report: "월보고",
};

export function MiniCalendar({ events, today, onDayClick, labelMode }: Props) {
  const todayDate = useMemo(() => new Date(today), [today]);
  const [cursor, setCursor] = useState(
    new Date(todayDate.getFullYear(), todayDate.getMonth(), 1),
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const monthLabel = `${year}년 ${month + 1}월`;
  const weekHeaders = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="이전 달"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="다음 달"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {weekHeaders.map((w, i) => (
          <div
            key={w}
            className={cn(
              "py-1",
              i === 0 && "text-urgent",
              i === 6 && "text-info",
            )}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const dayOfWeek = (i % 7);
          return (
            <button
              type="button"
              key={i}
              onClick={() => onDayClick?.(dateStr)}
              className={cn(
                "flex aspect-square flex-col items-stretch justify-start gap-0.5 rounded-md p-1 text-xs cursor-pointer transition-colors min-w-0",
                isToday
                  ? "bg-primary/10 ring-1 ring-primary text-foreground font-semibold"
                  : "hover:bg-muted",
                !isToday && dayOfWeek === 0 && "text-urgent",
                !isToday && dayOfWeek === 6 && "text-info",
              )}
            >
              <span className="leading-none text-left">{day}</span>
              {dayEvents.length > 0 && labelMode ? (
                <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
                  <span
                    className="truncate rounded bg-foreground/80 px-0.5 text-[9px] font-medium leading-tight text-background"
                    title={`${dayEvents[0].storeName} · ${dayEvents[0].title}`}
                  >
                    {eventLabel[dayEvents[0].type]}
                  </span>
                  {dayEvents.length > 1 && (
                    <span className="text-[9px] leading-tight text-muted-foreground">
                      +{dayEvents.length - 1}
                    </span>
                  )}
                </div>
              ) : dayEvents.length > 0 ? (
                <div className="mt-auto flex justify-start gap-0.5">
                  {dayEvents.slice(0, 3).map((e, idx) => (
                    <span
                      key={idx}
                      className={cn("size-1.5 rounded-full", eventTone[e.type])}
                      title={`${e.storeName} · ${e.title}`}
                    />
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-info" /> 마일스톤
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-violet-500" /> 미팅
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-success" /> 보고
        </span>
      </div>
    </div>
  );
}
