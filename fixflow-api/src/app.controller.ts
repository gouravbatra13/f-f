import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      success: true,
      message: 'FixFlow AI API is running',
      service: 'fixflow-api',
      timestamp: new Date().toISOString(),
    };
  }
}
