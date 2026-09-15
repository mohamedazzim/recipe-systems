import { Module } from '@nestjs/common';
import {
  RestrictionHighlightController,
  RestrictionProfileController,
  RestrictionVocabularyController,
} from './restriction.controller';
import { RestrictionService } from './restriction.service';

@Module({
  controllers: [
    RestrictionProfileController,
    RestrictionVocabularyController,
    RestrictionHighlightController,
  ],
  providers: [RestrictionService],
  exports: [RestrictionService],
})
export class RestrictionsModule {}
