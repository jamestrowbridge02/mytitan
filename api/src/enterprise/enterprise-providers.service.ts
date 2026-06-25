import { Injectable } from '@nestjs/common';
import { createEnterpriseProviderRegistry } from './enterprise-providers';

@Injectable()
export class EnterpriseProvidersService {
  private readonly registry = createEnterpriseProviderRegistry();

  async listSafeDiagnostics() {
    const providers = this.registry.list();
    const diagnostics = await Promise.all(providers.map((provider) => provider.dryRun()));
    return {
      providers: providers.map((provider, index) => ({
        id: provider.key,
        kind: provider.capabilities[0] || 'provider',
        label: provider.label,
        mode: 'dry_run',
        status: provider.status,
        capabilities: provider.capabilities,
        diagnostics: diagnostics[index],
      })),
    };
  }
}
