import { validateEnvironment } from './production.config';
describe('production configuration', () => {
 const valid = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64), DB_PASS: 'c'.repeat(64), FRONTEND_URL: 'https://pay.example.edu.vn' };
 it('boots without any registration provider', () => expect(validateEnvironment(valid)).toEqual(valid));
 it('rejects insecure configuration', () => {
  expect(() => validateEnvironment({...valid, DB_PASS: ''})).toThrow();
  expect(() => validateEnvironment({...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET})).toThrow();
  expect(() => validateEnvironment({...valid, FRONTEND_URL: 'http://localhost'})).toThrow();
  expect(() => validateEnvironment({...valid, DB_SYNCHRONIZE: 'true'})).toThrow();
 });
});
