import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeModule } from '../intake/intake.module';
import { RecipesModule } from '../recipes/recipes.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisEventsService } from './analysis-events.service';
import { AnalysisQueueService } from './analysis-queue.service';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [IntakeModule, RecipesModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AnalysisQueueService,
    AnalysisEventsService,
    {
      provide: 'DATABASE_URL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<string>('DATABASE_URL') ?? '',
    },
  ],
  exports: [AnalysisService, AnalysisQueueService],
})
export class AnalysisModule {}
