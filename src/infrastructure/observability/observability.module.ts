import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';
import { HealthService } from './health.service.js';

@Global()
@Module({
  providers: [MetricsService, HealthService],
  exports: [MetricsService, HealthService],
})
export class ObservabilityModule {}
