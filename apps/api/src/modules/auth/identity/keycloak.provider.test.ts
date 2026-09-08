// Keycloak provider tests — verification against a LOCAL JWKS (no network, no Keycloak).
const jose = require('jose') as typeof import('jose');
const { SignJWT } = jose;

describe('keycloak provider', () => {
  const cfg = {
    baseUrl: 'http://localhost:8081',
    realm: 'recipesystems',
    clientId: 'recipe-systems-bff',
    clientSecret: 'dev-secret',
    issuerUrl: 'http://localhost:8081/realms/recipesystems',
    redirectUri: 'http://localhost:3001/api/v1/auth/callback',
  };

  let privateKey: any;
  let publicJwk: any;
  let jwks: any;
  beforeAll(async () => {
    const fixture = await joseFixture();
    privateKey = fixture.privateKey;
    publicJwk = fixture.publicJwk;
    jwks = fixture.jwks;
  });

  async function makeIdToken(overrides: {
    iss?: string;
    aud?: string;
    nonce?: string;
    email?: string;
  } = {}): Promise<string> {
    return new SignJWT({
      email: overrides.email ?? 'x@test.dev',
      email_verified: true,
      nonce: overrides.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
      .setIssuer(overrides.iss ?? cfg.issuerUrl)
      .setAudience(overrides.aud ?? cfg.clientId)
      .setSubject('kc-sub-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  function makeProvider() {
    const { KeycloakProvider } = require('./keycloak.provider');
    const provider = new KeycloakProvider(cfg);
    // Point verification at a local JWKS so tests never hit the network.
    (provider as unknown as { jwks: ReturnType<typeof jose.createLocalJWKSet> }).jwks = jwks;
    return provider;
  }

  it('builds an authorization URL with code flow parameters', () => {
    const provider = makeProvider();
    const url = provider.buildAuthorizationUrl({ state: 'st-1', nonce: 'nc-1' });
    expect(url).toContain('response_type=code');
    expect(url).toContain(`client_id=${cfg.clientId}`);
    expect(url).toContain('state=st-1');
    expect(url).toContain('nonce=nc-1');
    expect(url).toContain('openid');
  });

  it('builds registration and password-reset URLs on the IdP account console', () => {
    const provider = makeProvider();
    const reg = provider.buildRegistrationUrl({ state: 'st-1', nonce: 'nc-1' });
    expect(reg).toContain('/realms/recipesystems/protocol/openid-connect/registrations');
    expect(reg).toContain(`client_id=${cfg.clientId}`);
    expect(reg).toContain('state=st-1');
    expect(reg).toContain('nonce=nc-1');
    expect(provider.buildPasswordResetUrl()).toContain('/realms/recipesystems/account');
  });

  it('builds the RP-initiated logout URL with client_id + post_logout_redirect_uri', () => {
    const provider = makeProvider();
    const url = provider.buildLogoutUrl('http://localhost:3000');
    expect(url).toContain('/realms/recipesystems/protocol/openid-connect/logout');
    expect(url).toContain(`client_id=${cfg.clientId}`);
    expect(url).toContain('post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000');
  });

  it('includes id_token_hint in the logout URL so Keycloak skips its confirmation screen', () => {
    const provider = makeProvider();
    const url = provider.buildLogoutUrl('http://localhost:3000', 'id-token-hint-value');
    expect(url).toContain('id_token_hint=id-token-hint-value');
  });

  it('verifies a valid ID token with issuer + audience + nonce', async () => {
    const provider = makeProvider();
    const token = await makeIdToken({ nonce: 'nc-1' });
    const claims = await provider.verifyIdToken(token, 'nc-1');
    expect(claims.email).toBe('x@test.dev');
    expect(claims.sub).toBe('kc-sub-1');
    expect(claims.emailVerified).toBe(true);
  });

  it('rejects a token from the wrong issuer', async () => {
    const provider = makeProvider();
    const token = await makeIdToken({ iss: 'https://evil.example/realms/recipesystems' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow();
  });

  it('rejects a token for the wrong audience', async () => {
    const provider = makeProvider();
    const token = await makeIdToken({ aud: 'other-client' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow();
  });

  it('rejects a nonce mismatch', async () => {
    const provider = makeProvider();
    const token = await makeIdToken({ nonce: 'other' });
    await expect(provider.verifyIdToken(token, 'expected')).rejects.toThrow();
  });

  it('rejects a token without an email claim', async () => {
    const provider = makeProvider();
    const token = await new SignJWT({ sub: 'kc-sub-1' })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
      .setIssuer(cfg.issuerUrl)
      .setAudience(cfg.clientId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(provider.verifyIdToken(token)).rejects.toThrow('email');
  });

  it('exchanges an authorization code and verifies the returned id_token', async () => {
    const provider = makeProvider();
    const idToken = await makeIdToken({ nonce: 'nc-9' });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id_token: idToken }), { status: 200 }),
      );
    const claims = await provider.handleCallback('code-1', 'st-9', 'nc-9');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/protocol/openid-connect/token'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(claims.email).toBe('x@test.dev');
    // Raw verified token surfaces as the logout id_token_hint.
    expect(claims.idTokenHint).toBe(idToken);
    fetchMock.mockRestore();
  });

  it('throws when the token exchange fails', async () => {
    const provider = makeProvider();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(provider.handleCallback('code-1', 'st', 'nc')).rejects.toThrow('token exchange');
  });
});

// --- local RS256 fixture (no network) ---
async function joseFixture() {
  const joseLib = require('jose');
  // jose v5 requires its own CryptoKey (node crypto KeyObjects don't export as JWK).
  const { publicKey, privateKey } = await joseLib.generateKeyPair('RS256', { extractable: true });
  const publicJwk = await joseLib.exportJWK(publicKey);
  publicJwk.kid = 'test-kid';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwks = joseLib.createLocalJWKSet({ keys: [publicJwk] });
  return { privateKey, publicJwk, jwks };
}
