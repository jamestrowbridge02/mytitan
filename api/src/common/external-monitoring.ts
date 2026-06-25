import { readHostStatusScript, type HostStatusSnapshot } from './host-status';

export type ExternalMonitoringSnapshot = HostStatusSnapshot & {
  appStatus: string | null;
  appUrl: string | null;
  apiStatus: string | null;
  apiUrl: string | null;
  marketingStatus: string | null;
  marketingUrl: string | null;
  nginxStatus: string | null;
  nginxDetail: string | null;
  tlsStatus: string | null;
  tlsExpiry: string | null;
  tlsDetail: string | null;
  externalMonitorStatus: string | null;
  externalMonitorDetail: string | null;
  externalMonitorProvider: string | null;
};

export function getExternalMonitoringSnapshot(): ExternalMonitoringSnapshot {
  const snapshot = readHostStatusScript('external-monitoring-status.sh', {
    status: 'unknown',
    detail: 'External monitoring checks could not be inspected from the current runtime.',
    values: {},
  });
  return {
    ...snapshot,
    appStatus: snapshot.values.APP_STATUS || null,
    appUrl: snapshot.values.APP_URL || null,
    apiStatus: snapshot.values.API_STATUS || null,
    apiUrl: snapshot.values.API_URL || null,
    marketingStatus: snapshot.values.MARKETING_STATUS || null,
    marketingUrl: snapshot.values.MARKETING_URL || null,
    nginxStatus: snapshot.values.NGINX_STATUS || null,
    nginxDetail: snapshot.values.NGINX_DETAIL || null,
    tlsStatus: snapshot.values.TLS_STATUS || null,
    tlsExpiry: snapshot.values.TLS_EXPIRY || null,
    tlsDetail: snapshot.values.TLS_DETAIL || null,
    externalMonitorStatus: snapshot.values.EXTERNAL_MONITOR_STATUS || null,
    externalMonitorDetail: snapshot.values.EXTERNAL_MONITOR_DETAIL || null,
    externalMonitorProvider: snapshot.values.EXTERNAL_MONITOR_PROVIDER || null,
  };
}
