import {
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MetricsController } from './metrics.controller.js';
import type { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  const render = vi.fn().mockResolvedValue({
    contentType: 'text/plain; version=0.0.4',
    body: 'fixflow_up 1\n',
  });
  const response = {
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };

  beforeEach(() => {
    render.mockClear();
    response.setHeader.mockClear();
    response.send.mockClear();
  });

  it('keeps metrics disabled when no scrape token is configured', async () => {
    const controller = new MetricsController(
      { render } as unknown as MetricsService,
      { get: vi.fn().mockReturnValue(null) } as unknown as ConfigService,
    );

    await expect(
      controller.scrape(undefined, response as unknown as Response),
    ).rejects.toThrow(NotFoundException);
    expect(render).not.toHaveBeenCalled();
  });

  it('requires a valid bearer token before returning metrics', async () => {
    const controller = new MetricsController(
      { render } as unknown as MetricsService,
      { get: vi.fn().mockReturnValue('metrics-token') } as unknown as ConfigService,
    );

    await expect(
      controller.scrape('Bearer wrong-token', response as unknown as Response),
    ).rejects.toThrow(UnauthorizedException);
    await controller.scrape(
      'Bearer metrics-token',
      response as unknown as Response,
    );

    expect(render).toHaveBeenCalledOnce();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(response.send).toHaveBeenCalledWith('fixflow_up 1\n');
  });
});
