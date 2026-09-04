import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../../../infrastructure/observability/metrics.service.js';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    return this.metricsService.metrics();
  }
}
