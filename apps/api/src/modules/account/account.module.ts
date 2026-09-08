import { Global, Module } from '@nestjs/common';
import { prisma } from '@recipe-systems/database';
import { AccountService } from './account.service';

@Global()
@Module({
  providers: [
    { provide: 'PRISMA', useValue: prisma },
    AccountService,
  ],
  exports: [AccountService, 'PRISMA'],
})
export class AccountModule {}
