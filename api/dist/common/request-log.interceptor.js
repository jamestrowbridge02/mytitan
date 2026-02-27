"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLogInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
let RequestLogInterceptor = class RequestLogInterceptor {
    constructor() {
        this.logger = new common_1.Logger('Request');
    }
    intercept(context, next) {
        if (context.getType() !== 'http') {
            return next.handle();
        }
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const requestId = String(req?.requestId ?? req?.headers?.['x-request-id'] ?? 'unknown');
        const method = String(req?.method ?? '-');
        const url = String(req?.originalUrl ?? req?.url ?? '-');
        const startedAt = Date.now();
        return next.handle().pipe((0, operators_1.tap)(() => {
            const statusCode = Number(res?.statusCode ?? 200);
            const durationMs = Date.now() - startedAt;
            this.logger.log(`requestId=${requestId} method=${method} url=${url} status=${statusCode} durationMs=${durationMs}`);
        }), (0, operators_1.catchError)((error) => {
            const statusCode = error instanceof common_1.HttpException ? error.getStatus() : 500;
            const durationMs = Date.now() - startedAt;
            this.logger.error(`requestId=${requestId} method=${method} url=${url} status=${statusCode} durationMs=${durationMs}`);
            return (0, rxjs_1.throwError)(() => error);
        }));
    }
};
exports.RequestLogInterceptor = RequestLogInterceptor;
exports.RequestLogInterceptor = RequestLogInterceptor = __decorate([
    (0, common_1.Injectable)()
], RequestLogInterceptor);
//# sourceMappingURL=request-log.interceptor.js.map