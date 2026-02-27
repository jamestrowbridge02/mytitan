import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private enabled = false;
  private redisUrl: string | null = null;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return;
    }

    try {
      new URL(redisUrl);
      this.redisUrl = redisUrl;
      this.enabled = true;
    } catch {
      this.redisUrl = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy() {
    this.enabled = false;
    this.redisUrl = null;
  }

  isEnabled() {
    return this.enabled;
  }

  getRedisUrl() {
    return this.redisUrl;
  }
}
