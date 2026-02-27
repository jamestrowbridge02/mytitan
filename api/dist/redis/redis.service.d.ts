import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private enabled;
    private redisUrl;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isEnabled(): boolean;
    getRedisUrl(): string;
}
