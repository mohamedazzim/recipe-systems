import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { CookController, CookLogController } from './cook.controller';
import { CookService } from './cook.service';

@Module({
  imports: [RecipesModule],
  controllers: [CookController, CookLogController],
  providers: [CookService],
  exports: [CookService],
})
export class CookModule {}
