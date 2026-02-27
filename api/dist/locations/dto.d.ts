export declare class LocationHourDto {
    weekday: number;
    startMinute?: number;
    endMinute?: number;
    isClosed?: boolean;
}
export declare class UpsertLocationDto {
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    isActive?: boolean;
    timezone?: string;
    bookingLeadTimeMins?: number;
    defaultAssigneeId?: string;
    staffUserIds?: string[];
    hours?: LocationHourDto[];
}
