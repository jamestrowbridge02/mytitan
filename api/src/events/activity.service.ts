import { Injectable } from "@nestjs/common";

type ActivityEvent = {
  id: string;
  type: string;
  label: string;
  at: string;
  jobId?: string | null;
  jobRef?: string | null;
  customerName?: string | null;
  status?: string | null;
};

@Injectable()
export class ActivityService {
  private readonly events: ActivityEvent[] = [];

  push(event: Omit<ActivityEvent, "id" | "at"> & { at?: string }) {
    const row: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: event.at || new Date().toISOString(),
      ...event,
    };
    this.events.unshift(row);
    if (this.events.length > 100) this.events.length = 100;
    return row;
  }

  list(limit = 20) {
    return this.events.slice(0, Math.max(1, Math.min(limit, 50)));
  }
}
