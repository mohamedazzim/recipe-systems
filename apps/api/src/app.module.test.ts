import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { IDENTITY_PROVIDER } from './modules/auth/identity/identity.module';

describe('AppModule', () => {
  it('compiles with mocked identity + database providers', async () => {
    const identity = {
      buildAuthorizationUrl: () => '',
      buildRegistrationUrl: () => '',
      buildPasswordResetUrl: () => '',
      handleCallback: async () => ({ sub: 's', email: 'e' }),
      verifyIdToken: async () => ({ sub: 's', email: 'e' }),
    };
    const prisma = { $connect: async () => undefined, $disconnect: async () => undefined };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(identity)
      .overrideProvider('PRISMA')
      .useValue(prisma)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
