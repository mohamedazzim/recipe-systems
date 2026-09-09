import { Module } from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { RecipesController } from './recipes.controller';

@Module({
  controllers: [RecipesController],
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipesModule {}
