import { INestApplication, UnauthorizedException } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

jest.mock('./auth.service', () => ({ AuthService: class AuthService {} }));

describe('Auth HTTP responses', () => {
  let app: INestApplication;
  const service = {
    refresh: jest.fn(),
    studentLogin: jest.fn(),
    adminLogin: jest.fn(),
  };
  const registration = {
    requestOtp: jest.fn(),
    verify: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: RegistrationService, useValue: registration },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns one standard 401 response when refresh cookie is missing', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    expect(res.body).toMatchObject({ success: false, data: null, code: 'UNAUTHORIZED', statusCode: 401 });
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(service.refresh).not.toHaveBeenCalled();
    // A subsequent request must still complete normally.
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
  });

  it.each([
    { endpoint: 'login', method: 'studentLogin' as const, credentials: { studentCode: 'SV001', password: 'secret' }, role: 'student' },
    { endpoint: 'admin/login', method: 'adminLogin' as const, credentials: { username: 'admin', password: 'secret' }, role: 'admin' },
  ])('uses the dedicated $role login service and sets cookies', async ({ endpoint, method, credentials, role }) => {
    service[method].mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: { id: '1', role } });
    const res = await request(app.getHttpServer()).post(`/api/v1/auth/${endpoint}`).send(credentials).expect(200);
    expect(res.body).toMatchObject({ success: true, data: { user: { role } } });
    expect(service[method]).toHaveBeenCalledWith('studentCode' in credentials ? credentials.studentCode : credentials.username, 'secret');
    expect(service[method === 'studentLogin' ? 'adminLogin' : 'studentLogin']).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('access_token='), expect.stringContaining('refresh_token=')]));
  });

  it('clears stale cookies when refresh is rejected so login does not redirect back', async () => {
    service.refresh.mockRejectedValue(new UnauthorizedException('Session expired'));
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=expired').expect(401);
    expect(service.refresh).toHaveBeenCalledWith('expired');
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('access_token=;'), expect.stringContaining('refresh_token=;'),
    ]));
  });
});
