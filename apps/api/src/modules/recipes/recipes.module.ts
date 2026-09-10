import { Module } from '@nestjs/common';
import { StorageService } from '../intake/storage.service';
import { RecipeService } from './recipe.service';
import { RecipesController } from './recipes.controller';

@Module({
  controllers: [RecipesController],
  providers: [RecipeService, StorageService],
  exports: [RecipeService],
})
export class RecipesModule {}
