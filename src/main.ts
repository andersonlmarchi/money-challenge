import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './infrastructure/http/filters/domain-exception.filter.js';
import { StructuredLoggingInterceptor } from './infrastructure/http/interceptors/structured-logging.interceptor.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(new StructuredLoggingInterceptor());
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
