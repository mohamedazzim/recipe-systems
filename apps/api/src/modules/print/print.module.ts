import { Module } from '@nestjs/common';
import { chromiumRuntime } from '@recipe-systems/rendering';
import { RecipesModule } from '../recipes/recipes.module';
import { PrintController } from './print.controller';
import { PRINT_RUNTIME, PrintService } from './print.service';

@Module({
  imports: [RecipesModule],
  controllers: [PrintController],
  providers: [
    PrintService,
    { provide: PRINT_RUNTIME, useFactory: () => chromiumRuntime() },
  ],
  exports: [PrintService],
})
export class PrintModule {}
