import { execFileSync } from 'child_process';
import * as path from 'path';

export type HostStatus = 'ready' | 'not_configured' | 'needs_setup' | 'needs_backup_run' | 'needs_restore_drill' | 'needs_schedule' | 'unknown';

export type HostStatusSnapshot = {
  status: HostStatus;
  detail: string;
  values: Record<string, string>;
};

export function readHostStatusScript(scriptName: string, fallback: HostStatusSnapshot): HostStatusSnapshot {
  const scriptPath = path.resolve(process.cwd(), 'scripts', scriptName);
  try {
    const output = execFileSync('bash', [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseHostStatusOutput(output, fallback);
  } catch (error: any) {
    const output = `${String(error?.stdout || '')}\n${String(error?.stderr || '')}`;
    return parseHostStatusOutput(output, fallback);
  }
}

function parseHostStatusOutput(output: string, fallback: HostStatusSnapshot): HostStatusSnapshot {
  const values: Record<string, string> = {};
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line || !line.includes(':')) continue;
    const [key, ...rest] = line.split(':');
    values[key] = rest.join(':').trim();
  }
  return {
    status: normalizeHostStatus(values.STATUS, fallback.status),
    detail: values.DETAIL || fallback.detail,
    values,
  };
}

function normalizeHostStatus(value: string | undefined, fallback: HostStatus): HostStatus {
  switch (String(value || '').trim()) {
    case 'ready':
      return 'ready';
    case 'not_configured':
      return 'not_configured';
    case 'needs_setup':
      return 'needs_setup';
    case 'needs_backup_run':
      return 'needs_backup_run';
    case 'needs_restore_drill':
      return 'needs_restore_drill';
    case 'needs_schedule':
      return 'needs_schedule';
    case 'unknown':
      return 'unknown';
    default:
      return fallback;
  }
}
