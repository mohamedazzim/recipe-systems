// Identity module — registers the provider-neutral seam (D-06).
//
// KEYCLOAK_PROVIDER selection: the seam is config-driven. Adding a different
// provider means registering another IdentityProvider implementation here —
// consuming code never changes.

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityProvider } from './identity-provider.interface';
import { KeycloakConfig, KeycloakProvider } from './keycloak.provider';

export const IDENTITY_PROVIDER = 'IDENTITY_PROVIDER';

function keycloakConfigFromEnv(config: ConfigService): KeycloakConfig {
  const baseUrl = config.get<string>('KEYCLOAK_BASE_URL', 'http://localhost:8081');
  const realm = config.get<string>('KEYCLOAK_REALM', 'recipesystems');
  const issuerUrl =
    config.get<string>('KEYCLOAK_ISSUER_URL', `${baseUrl}/realms/${realm}`);
  return {
    baseUrl,
    realm,
    clientId: config.get<string>('KEYCLOAK_CLIENT_ID', 'recipe-systems-bff'),
    clientSecret: config.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
    issuerUrl,
    redirectUri: config.get<string>(
      'AUTH_REDIRECT_URI',
      `${config.get<string>('AUTH_REDIRECT_BASE', 'http://localhost:3001')}/api/v1/auth/callback`,
    ),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: 'KEYCLOAK_CONFIG',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => keycloakConfigFromEnv(config),
    },
    {
      provide: IDENTITY_PROVIDER,
      inject: ['KEYCLOAK_CONFIG'],
      useFactory: (kc: KeycloakConfig): IdentityProvider => new KeycloakProvider(kc),
    },
  ],
  exports: [IDENTITY_PROVIDER],
})
export class IdentityModule {}
