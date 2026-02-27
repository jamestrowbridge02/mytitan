"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const request_log_interceptor_1 = require("./common/request-log.interceptor");
const request_id_middleware_1 = require("./common/request-id.middleware");
const core_1 = require("@nestjs/core");
const express_1 = require("express");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    const originEnv = process.env.CORS_ALLOWED_ORIGINS ?? '';
    const origins = originEnv
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.enableCors({
        origin: origins.length > 0 ? origins : true,
        credentials: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['x-request-id'],
    });
    app.use(request_id_middleware_1.requestIdMiddleware);
    app.useGlobalInterceptors(new request_log_interceptor_1.RequestLogInterceptor());
    app.use(['/stripe/webhook', '/billing/webhook'], (0, express_1.raw)({ type: 'application/json' }));
    app.use((0, express_1.json)());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
}
bootstrap();
//# sourceMappingURL=main.js.map