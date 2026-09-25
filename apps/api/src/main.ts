import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  // The JSON body limit must sit ABOVE the app's own paste cap, or that cap is unreachable.
  // Express defaults to 100 KB while `parseTextSchema` accepts 200,000 characters (PERF-019),
  // so an oversized paste died inside raw-body with PayloadTooLargeError before any controller
  // ran: the schema's own rejection never produced the clean 400 INVALID_TEXT it was written
  // to produce, and the deployment answered 500 for a body the app had a specific answer for.
  // 1 MB covers 200,000 characters even at 4 bytes each. Multipart uploads are unaffected —
  // they carry their own MAX_IMAGE_BYTES / MAX_DOCUMENT_BYTES limits.
  //
  // Nest's default parsers are disabled rather than supplemented: body-parser skips a request
  // whose body is already parsed, so a second registration would never be reached and the
  // default 100 KB limit would keep winning.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({ origin: origins, credentials: true });

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
