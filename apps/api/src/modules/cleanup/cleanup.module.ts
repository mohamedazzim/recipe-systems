import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { CleanupRunner } from './cleanup.runner';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [RecipesModule],
  providers: [CleanupService, CleanupRunner],
  exports: [CleanupService],
})
export class CleanupModule {}
