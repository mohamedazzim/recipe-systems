import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { IdentityModule } from './identity/identity.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [IdentityModule, AccountModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
