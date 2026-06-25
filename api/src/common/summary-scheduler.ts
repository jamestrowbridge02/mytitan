import { readHostStatusScript } from './host-status';

export type SummarySchedulerStatusSnapshot = {
  status: 'ready' | 'not_configured' | 'unknown';
  detail: string;
};

export function getSummarySchedulerStatusSnapshot(): SummarySchedulerStatusSnapshot {
  const snapshot = readHostStatusScript('summary-scheduler-status.sh', {
    status: 'unknown',
    detail: 'Run sudo ENABLE_TIMERS=1 /opt/mytitan/scripts/install-summary-scheduler.sh on the production systemd host, then verify with bash /opt/mytitan/scripts/summary-scheduler-status.sh.',
    values: {},
  });
  return { status: snapshot.status === 'ready' ? 'ready' : snapshot.status === 'unknown' ? 'unknown' : 'not_configured', detail: snapshot.detail };
}
