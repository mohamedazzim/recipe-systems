import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeModule } from '../intake/intake.module';
import { RecipesModule } from '../recipes/recipes.module';
import { IngestionController } from './ingestion.controller';
import { IngestionQueueService } from './ingestion.queue.service';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [IntakeModule, RecipesModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionQueueService,
    {
      provide: 'DATABASE_URL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<string>('DATABASE_URL') ?? '',
    },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
