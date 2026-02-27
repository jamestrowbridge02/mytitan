"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const prisma_service_1 = require("../prisma/prisma.service");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(config, prisma) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.get('JWT_SECRET', 'dev_insecure'),
        });
        this.prisma = prisma;
    }
    async validate(payload) {
        const db = this.prisma;
        const user = await db.user.findFirst({
            where: { id: payload.sub, companyId: payload.companyId },
            select: { tokenVersion: true, emailVerified: true, email: true, role: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Session is no longer valid');
        }
        if (Number(payload.tokenVersion ?? 0) !== Number(user.tokenVersion ?? 0)) {
            throw new common_1.UnauthorizedException('Session expired. Please sign in again.');
        }
        return {
            ...payload,
            email: user.email,
            role: user.role,
            emailVerified: Boolean(user.emailVerified),
            tokenVersion: Number(user.tokenVersion ?? 0),
            demoUser: payload.demoUser || user.email === 'demo@mytitan.co.uk',
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService, prisma_service_1.PrismaService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map