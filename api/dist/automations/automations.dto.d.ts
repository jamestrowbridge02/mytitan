export declare class UpdateAutomationsSettingsDto {
    bookingRemindersEnabled?: boolean;
    approvalRequestEnabled?: boolean;
    reviewRequestEnabled?: boolean;
    deliveryMode?: "metadata_only" | "live_send";
    confirmLiveSend?: boolean;
}
