import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './modules/account/account.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { AuthModule } from './modules/auth/auth.module';
import { IntakeModule } from './modules/intake/intake.module';
import { ReferenceDataModule } from './admin/reference-data.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { PrintModule } from './modules/print/print.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AccountModule,
    AuthModule,
    IntakeModule,
    AnalysisModule,
    ReferenceDataModule,
    ShoppingModule,
    PrintModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
