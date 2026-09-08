import { Module, OnModuleInit } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { StorageService } from './storage.service';

@Module({
  imports: [RecipesModule],
  controllers: [IntakeController],
  providers: [IntakeService, StorageService],
  exports: [IntakeService, StorageService],
})
export class IntakeModule implements OnModuleInit {
  constructor(private readonly storage: StorageService) {}

  async onModuleInit(): Promise<void> {
    await this.storage.ensureBucket();
  }
}
