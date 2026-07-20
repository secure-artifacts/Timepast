import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Edit3, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { copyTextForEntries, copyTextForEntry, formatDuration, minutesBetween } from "../../lib/time";
import type { EventType, TimeEntry } from "../../lib/types";

type EntryListProps = {
  entries: TimeEntry[];
  events?: EventType[];
  refresh?: () => Promise<void>;
  compact?: boolean;
};

export function EntryList({ entries, events, refresh, compact = false }: EntryListProps) {
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(() => new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  const baseEntries = pendingDelete ? entries.filter((item) => item.id !== pendingDelete.id) : entries;
  const visibleEntries = selectedCategoryId === null
    ? baseEntries
    : baseEntries.filter((item) => item.eventTypeId === selectedCategoryId);
  const groupedBaseEntries = useMemo(() => baseEntries.reduce<Record<string, TimeEntry[]>>((result, item) => {
    (result[item.entryDate] ||= []).push(item);
    return result;
  }, {}), [baseEntries]);
  const groupedVisibleEntries = useMemo(() => visibleEntries.reduce<Record<string, TimeEntry[]>>((result, item) => {
    (result[item.entryDate] ||= []).push(item);
    return result;
  }, {}), [visibleEntries]);
  const categories = useMemo(
    () => Array.from(new Map(baseEntries.map((item) => [item.eventTypeId, item])).values()),
    [baseEntries]
  );


  useEffect(() => () => {
    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
  }, []);

  const saveEdit = async () => {
    if (!editing || !refresh) return;
    await api.saveTimeEntry({ ...editing });
    setEditing(null);
    await refresh();
  };

  const stageDelete = (entry: TimeEntry) => {
    if (pendingDelete) return;
    setPendingDelete(entry);
    deleteTimerRef.current = window.setTimeout(async () => {
      await api.deleteTimeEntry(entry.id);
      setPendingDelete(null);
      deleteTimerRef.current = null;
      await refresh?.();
    }, 8000);
  };

  const undoDelete = () => {
    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    setPendingDelete(null);
  };

  const copyDayEntries = (date: string) => {
    const items = selectedCategoryId === null ? groupedBaseEntries[date] : groupedVisibleEntries[date];
    if (items?.length) void navigator.clipboard.writeText(copyTextForEntries(items));
  };

  return (
    <div className={compact ? "entry-list compact" : "entry-list"}>
      <div className="entry-list-actions">
        <div className="entry-category-filter" aria-label={"按类别筛选"}>
          <span>{"类别"}</span>
          <button type="button" className={selectedCategoryId === null ? "active" : ""} onClick={() => setSelectedCategoryId(null)}>{"全部"}</button>
          {categories.map((item) => (
            <button type="button" className={selectedCategoryId === item.eventTypeId ? "active" : ""} key={item.eventTypeId} onClick={() => setSelectedCategoryId(item.eventTypeId)}>
              <i style={{ background: item.eventColor }} />{item.eventName}
            </button>
          ))}
        </div>

      </div>

      {pendingDelete && (
        <div className="delete-undo" role="status">
          <span>{"“"}{pendingDelete.eventName}{"”已移入待删除"}</span>
          <button onClick={undoDelete}>{"撤回"}</button>
        </div>
      )}

      {Object.entries(groupedBaseEntries)
        .filter(([date]) => selectedCategoryId === null || groupedVisibleEntries[date]?.length)
        .map(([date, allDayEntries]) => {
          const items = selectedCategoryId === null ? allDayEntries : groupedVisibleEntries[date];
          const totalMinutes = items.reduce(
            (sum, item) => sum + Math.max(0, minutesBetween(item.startTime, item.endTime)),
            0
          );

          return (
            <div className="entry-day" key={date}>
              <div className="entry-day-header">
                <button className="entry-day-head" onClick={() => setCollapsedDates((current) => {
                  const next = new Set(current);
                  if (next.has(date)) next.delete(date); else next.add(date);
                  return next;
                })} aria-expanded={!collapsedDates.has(date)}>
                  <ChevronDown size={16} className={collapsedDates.has(date) ? "collapsed" : ""} />
                  <strong>{date}</strong><span>{items.length}{" 条记录"} · {formatDuration(totalMinutes)}</span>
                </button>
                <div className="entry-day-categories" aria-label={`${date} 的类别`}>
                  <button type="button" className={selectedCategoryId === null ? "active" : ""} onClick={() => setSelectedCategoryId(null)}>{"全部"}</button>
                  {Array.from(new Map(allDayEntries.map((item) => [item.eventTypeId, item])).values()).map((item) => (
                    <button type="button" className={selectedCategoryId === item.eventTypeId ? "active" : ""} key={item.eventTypeId} onClick={() => setSelectedCategoryId(item.eventTypeId)}>
                      <i style={{ background: item.eventColor }} />{item.eventName}
                    </button>
                  ))}
                </div>
                <button type="button" className="entry-copy-all entry-day-copy" disabled={!items.length} onClick={() => copyDayEntries(date)}>
                  <Copy size={15} />{"复制全部"}
                </button>
              </div>

              {!collapsedDates.has(date) && items.map((item) => editing?.id === item.id ? (
                <div className="entry-edit" key={item.id}>
                  <input type="date" value={editing.entryDate} onChange={(event) => setEditing({ ...editing, entryDate: event.target.value })} />
                  <input type="time" value={editing.startTime} onChange={(event) => setEditing({ ...editing, startTime: event.target.value })} />
                  <input type="time" value={editing.endTime} onChange={(event) => setEditing({ ...editing, endTime: event.target.value })} />
                  <select value={editing.eventTypeId} onChange={(event) => setEditing({ ...editing, eventTypeId: Number(event.target.value) })}>
                    {events?.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                  </select>
                  <input value={editing.note} placeholder={"备注"} onChange={(event) => setEditing({ ...editing, note: event.target.value })} />
                  <button className="primary" onClick={saveEdit}>{"保存"}</button>
                  <button onClick={() => setEditing(null)}>{"取消"}</button>
                </div>
              ) : (
                <div className="entry-row" key={item.id}>
                  <span className="dot" style={{ background: item.eventColor }} />
                  <span className="entry-category" title={item.eventName}>
                    <i style={{ background: item.eventColor }} />{item.eventName}
                  </span>
                  <strong>{item.startTime}-{item.endTime}</strong>
                  <em>{item.note || "无备注"}</em>
                  <button title={"复制时间和备注"} aria-label={"复制时间和备注"} onClick={() => void navigator.clipboard.writeText(copyTextForEntry(item))}><Copy size={15} /></button>
                  {!compact && <button title={"编辑记录"} aria-label={"编辑记录"} onClick={() => setEditing(item)}><Edit3 size={15} /></button>}
                  {!compact && <button className="danger-icon" title={"删除记录，8 秒内可撤回"} aria-label={"删除记录"} disabled={!!pendingDelete} onClick={() => stageDelete(item)}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}
