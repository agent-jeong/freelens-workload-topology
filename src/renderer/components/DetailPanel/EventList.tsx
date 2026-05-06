import React from "react";
import type { KubeEventLike } from "../../types";
import { eventCount, eventData, eventSource, eventTimestamp, formatEventTime } from "../../utils/events";

export function EventList({ events, limit }: { events: KubeEventLike[]; limit?: number }) {
  const visibleEvents = limit ? events.slice(0, limit) : events;

  if (events.length === 0) {
    return <div className="TopologyDetails__eventEmpty">No recent events for this resource.</div>;
  }

  return (
    <>
      {visibleEvents.map((event) => {
        const data = eventData(event);
        const type = data.type ?? "Normal";
        const count = eventCount(event);
        const source = eventSource(event);

        return (
          <div key={`${data.involvedObject?.kind ?? data.regarding?.kind}:${data.involvedObject?.name ?? data.regarding?.name}:${data.reason}:${eventTimestamp(data)}`} className={`TopologyDetails__event is-${type.toLowerCase()}`}>
            <div className="TopologyDetails__eventHeader">
              <strong>{data.reason ?? type}</strong>
              <span>{formatEventTime(data)}{count > 1 ? ` · x${count}` : ""}</span>
            </div>
            <p>{data.message ?? data.note ?? data.action ?? "No event message."}</p>
            {source ? <small>{source}</small> : null}
          </div>
        );
      })}
      {limit && events.length > limit ? <div className="TopologyDetails__eventMore">+{events.length - limit} more events</div> : null}
    </>
  );
}
