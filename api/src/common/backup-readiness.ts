import { readHostStatusScript, type HostStatusSnapshot } from './host-status';

export type BackupReadinessSnapshot = HostStatusSnapshot & {
  lastBackupAt: string | null;
  lastBackupArtifact: string | null;
  lastBackupSizeBytes: number | null;
  encryptionStatus: string | null;
  lastRestoreDrillAt: string | null;
  scheduleStatus: string | null;
  scheduleDetail: string | null;
  restoreStatus: string | null;
  restoreDetail: string | null;
};

export function getBackupReadinessSnapshot(): BackupReadinessSnapshot {
  const snapshot = readHostStatusScript('backup-readiness-status.sh', {
    status: 'unknown',
    detail: 'Backup evidence could not be inspected from the current runtime.',
    values: {},
  });
  return {
    ...snapshot,
    lastBackupAt: snapshot.values.LAST_BACKUP_AT || null,
    lastBackupArtifact: snapshot.values.LAST_BACKUP_ARTIFACT || null,
    lastBackupSizeBytes: Number.isFinite(Number(snapshot.values.LAST_BACKUP_SIZE_BYTES)) ? Number(snapshot.values.LAST_BACKUP_SIZE_BYTES) : null,
    encryptionStatus: snapshot.values.BACKUP_ENCRYPTION_STATUS || null,
    lastRestoreDrillAt: snapshot.values.LAST_RESTORE_DRILL_AT || null,
    scheduleStatus: snapshot.values.SCHEDULE_STATUS || null,
    scheduleDetail: snapshot.values.SCHEDULE_DETAIL || null,
    restoreStatus: snapshot.values.RESTORE_STATUS || null,
    restoreDetail: snapshot.values.RESTORE_DETAIL || null,
  };
}
