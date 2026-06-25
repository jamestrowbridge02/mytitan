export type EnterpriseProviderStatus = 'setup_needed' | 'verifying' | 'ready' | 'degraded' | 'disabled';

export type EnterpriseProviderCapability =
  | 'payments.customer_intents'
  | 'telemetry.ingest'
  | 'route.preview'
  | 'supplier.catalogue'
  | 'notifications.send'
  | 'offline.packet_sync';

export type EnterpriseProviderDiagnostic = {
  status: EnterpriseProviderStatus;
  summary: string;
  checkedAt?: Date | string | null;
  safeDetails?: Record<string, string | number | boolean | null>;
};

export interface EnterpriseProviderContract {
  key: string;
  label: string;
  status: EnterpriseProviderStatus;
  capabilities: EnterpriseProviderCapability[];
  dryRun(): Promise<EnterpriseProviderDiagnostic>;
}

export interface TenantPaymentProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'payments.customer_intents'>;
}

export interface TelemetryProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'telemetry.ingest'>;
}

export interface RouteOptimisationProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'route.preview'>;
}

export interface SupplierProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'supplier.catalogue'>;
}

export interface NotificationProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'notifications.send'>;
}

export interface OfflineSyncProviderContract extends EnterpriseProviderContract {
  capabilities: Array<'offline.packet_sync'>;
}

export class DryRunEnterpriseProvider implements EnterpriseProviderContract {
  readonly status: EnterpriseProviderStatus = 'setup_needed';

  constructor(
    readonly key: string,
    readonly label: string,
    readonly capabilities: EnterpriseProviderCapability[],
    private readonly summary = 'Provider contract is scaffolded; no live provider is configured.',
  ) {}

  async dryRun(): Promise<EnterpriseProviderDiagnostic> {
    return {
      status: this.status,
      summary: this.summary,
      checkedAt: new Date().toISOString(),
      safeDetails: {
        provider: this.key,
        liveMutation: false,
      },
    };
  }
}

export class EnterpriseProviderRegistry {
  private readonly providers = new Map<string, EnterpriseProviderContract>();

  register(provider: EnterpriseProviderContract) {
    this.providers.set(provider.key, provider);
  }

  list() {
    return Array.from(this.providers.values());
  }

  get(key: string) {
    return this.providers.get(key) || null;
  }
}

export function createEnterpriseProviderRegistry() {
  const registry = new EnterpriseProviderRegistry();
  registry.register(new DryRunEnterpriseProvider('tenant_payments_dry_run', 'Tenant payment provider contract', ['payments.customer_intents']));
  registry.register(new DryRunEnterpriseProvider('telemetry_bridge_dry_run', 'Telemetry bridge contract', ['telemetry.ingest']));
  registry.register(new DryRunEnterpriseProvider('route_preview_dry_run', 'Route preview contract', ['route.preview']));
  registry.register(new DryRunEnterpriseProvider('supplier_catalogue_dry_run', 'Supplier catalogue contract', ['supplier.catalogue']));
  registry.register(new DryRunEnterpriseProvider('notification_provider_dry_run', 'Notification provider contract', ['notifications.send']));
  registry.register(new DryRunEnterpriseProvider('offline_packet_dry_run', 'Offline packet sync contract', ['offline.packet_sync']));
  return registry;
}

