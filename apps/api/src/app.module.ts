import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './modules/account/account.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { AuthModule } from './modules/auth/auth.module';
import { IntakeModule } from './modules/intake/intake.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { ReferenceDataModule } from './admin/reference-data.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { PrintModule } from './modules/print/print.module';
import { CookModule } from './modules/cook/cook.module';
import { RestrictionsModule } from './modules/restrictions/restriction.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // Env-file resolution is CWD-robust: `npm run dev -w @recipe-systems/api`
    // runs the app with CWD = apps/api, so the canonical repo-root .env is
    // reached via the parent path. dotenv uses the FIRST file that exists.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    AccountModule,
    AuthModule,
    IntakeModule,
    IngestionModule,
    AnalysisModule,
    ReferenceDataModule,
    ShoppingModule,
    PrintModule,
    CookModule,
    RestrictionsModule,
    ReviewsModule,
    CleanupModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
