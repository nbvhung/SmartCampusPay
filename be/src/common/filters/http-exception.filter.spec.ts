import { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it.each([
    { headersSent: true, writableEnded: false },
    { headersSent: false, writableEnded: true },
  ])('does not write to a completed response (%j)', (state) => {
    const response = { ...state, status: jest.fn(), setHeader: jest.fn(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost;
    expect(() => new HttpExceptionFilter().catch(new Error('Late failure'), host)).not.toThrow();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
