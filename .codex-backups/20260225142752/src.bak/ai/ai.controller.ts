import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Feature } from '../common/feature.decorator';
import { FeatureGuard } from '../common/feature.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AiChatDto } from './ai.dto';
import { AiService } from './ai.service';

@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  @Feature('ai_enabled')
  chat(@CurrentUser() user: JwtPayload, @Body() dto: AiChatDto) {
    return this.aiService.chat(user.companyId, user.sub, dto.message, dto.purpose);
  }
}
