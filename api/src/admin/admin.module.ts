import { Module } from '@nestjs/common';
import { DevAdminController } from './dev-admin.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [DevAdminController],
})
export class AdminModule {}
