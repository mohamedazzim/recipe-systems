// D-29 (Track R): admin/reference-data module. Sole logical writer of the
// curated reference tables (ADR §2). NO public HTTP controller — the canonical
// docs prescribe no admin HTTP surface; the reviewed import path is driven by
// the CLI (cli/import-cli.ts) through ReferenceDataService.
//
// Q5 remains OPEN: ingredient_dictionary / ingredient_alias are written here
// under the labeled admin-module working assumption (SCAFFOLD §7), not a final
// decision.

import { Module } from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { ReferenceDataRepository } from './reference-data.repository';
import { ReferenceDataService } from './reference-data.service';

@Module({
  providers: [
    ReferenceDataRepository,
    {
      provide: ReferenceDataService,
      useFactory: (prisma: PrismaClient) =>
        new ReferenceDataService(
          new ReferenceDataRepository(prisma),
          'infra/reference-data/approvals',
        ),
      inject: ['PRISMA'],
    },
  ],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
