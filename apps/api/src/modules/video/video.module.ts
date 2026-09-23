import { Module } from '@nestjs/common';
import { IntakeModule } from '../intake/intake.module';
import { RecipesModule } from '../recipes/recipes.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [IntakeModule, RecipesModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
