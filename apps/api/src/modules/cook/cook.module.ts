import { Module } from '@nestjs/common';
import { IntakeModule } from '../intake/intake.module';
import { RecipesModule } from '../recipes/recipes.module';
import { CookController, CookLogController } from './cook.controller';
import { CookService } from './cook.service';

@Module({
  imports: [RecipesModule, IntakeModule],
  controllers: [CookController, CookLogController],
  providers: [CookService],
  exports: [CookService],
})
export class CookModule {}
