export type ScheduleCapacityQuery = {
  from?: string;
  to?: string;
  locationId?: string;
};

export type SchedulePressureQuery = {
  date?: string;
  technicianId?: string;
  locationId?: string;
};

export type ScheduleRecommendationQuery = {
  entityType?: string;
  entityId?: string;
  scheduledAt?: string;
  locationId?: string;
};

export type UpsertTechnicianAvailabilityDto = {
  technicianId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacityMinutes: number;
  notesJson?: Record<string, any> | null;
};

export type PatchTechnicianAvailabilityDto = Partial<UpsertTechnicianAvailabilityDto>;

export type UpsertTechnicianCapacityExceptionDto = {
  technicianId: string;
  date: string;
  type: "UNAVAILABLE" | "REDUCED_CAPACITY" | "OVERTIME";
  startTime: string;
  endTime: string;
  capacityMinutes: number;
  reason?: string | null;
};

export type PatchTechnicianCapacityExceptionDto = Partial<UpsertTechnicianCapacityExceptionDto>;
