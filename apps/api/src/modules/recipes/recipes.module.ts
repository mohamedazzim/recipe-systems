import { Module } from '@nestjs/common';
import { RecipeService } from './recipe.service';

@Module({
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipesModule {}
