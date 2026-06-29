import helmet from "helmet";
import { ValidationPipe } from '@nestjs/common';
import { RequestLogInterceptor } from './common/request-log.interceptor';
import { requestIdMiddleware } from './common/request-id.middleware';
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';
import { AppModule } from './app.module';
import { UploadExceptionFilter } from './common/upload-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const sec = (process.env.MYTITAN_SECURITY_HEADERS || '').trim().toLowerCase();
  const securityOn = sec === 'on' || sec === 'true' || sec === '1';
  if (securityOn) {
    // CSP can break embedded/portal flows; start with safe defaults.
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
  }
  const originEnv = process.env.CORS_ALLOWED_ORIGINS ?? '';
  const origins = originEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const productionFallbackOrigins = [
    process.env.APP_PUBLIC_URL,
    process.env.MARKETING_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map((origin) => String(origin || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowedOrigins = origins.length > 0
    ? origins
    : process.env.NODE_ENV === 'production'
      ? productionFallbackOrigins
      : [];

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : process.env.NODE_ENV !== 'production',
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['x-request-id'],
  });

  app.use(requestIdMiddleware);
  app.useGlobalInterceptors(new RequestLogInterceptor());

  // Stripe signature verification requires the exact raw body bytes.
  app.use(['/stripe/webhook', '/billing/webhook'], raw({ type: 'application/json' }));
  app.use(/^\/integrations\/webhooks\/[^/]+\/[^/]+$/, raw({ type: '*/*' }));
  app.use(['/billing/stripe-connect/webhook', '/billing/customer-payments/stripe-connect/webhook'], raw({ type: 'application/json' }));
  app.use(/^\/billing\/customer-payments\/webhook\/[^/]+\/[^/]+$/, raw({ type: '*/*' }));
  app.use(json({ limit: process.env.JSON_BODY_LIMIT || '40mb' }));
  app.useGlobalFilters(new UploadExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
