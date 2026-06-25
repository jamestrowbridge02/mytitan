import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isSchedulingIntelligenceV1Enabled } from '../common/feature-flags';
import { featureGate } from '../common/feature-gate';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CalendarService } from './calendar.service';

type WeeklyScheduleSlot = {
  start?: string | null;
  end?: string | null;
  role?: string | null;
  venue?: string | null;
  breakMinutes?: number | null;
  notes?: string | null;
  absence?: boolean;
};

type WeeklyScheduleJson = Record<string, WeeklyScheduleSlot[]>;

type ScheduleExceptionDto = {
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  reason?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('calendar')
export class SchedulingController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('suggest')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  suggestSlots(
    @CurrentUser() user: JwtPayload,
    @Query('bookingId') bookingId?: string,
    @Query('windowDays') windowDays?: string,
    @Query('limit') limit?: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'read',
    });
    if (!bookingId) {
      throw new BadRequestException('Missing required query parameter: bookingId');
    }
    const parsedWindowDays = this.coerceInt(windowDays, 7);
    const parsedLimit = this.coerceInt(limit, 3);
    const clampedWindowDays = this.clamp(parsedWindowDays, 1, 14);
    const clampedLimit = this.clamp(parsedLimit, 1, 5);
    return this.calendarService.suggestSlots(user.companyId, bookingId, clampedWindowDays, clampedLimit);
  }

  @Get('schedules')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  listSchedules(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'read',
    });
    return this.calendarService.listSchedules(user.companyId, { from, to });
  }

  @Get('suggest-draft')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  suggestDraftSlots(
    @CurrentUser() user: JwtPayload,
    @Query('durationMinutes') durationMinutes?: string,
    @Query('windowDays') windowDays?: string,
    @Query('limit') limit?: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'read',
    });
    const parsedDuration = this.coerceInt(durationMinutes, 60);
    const parsedWindowDays = this.coerceInt(windowDays, 7);
    const parsedLimit = this.coerceInt(limit, 3);
    const clampedDuration = this.clamp(parsedDuration, 15, 480);
    const clampedWindowDays = this.clamp(parsedWindowDays, 1, 14);
    const clampedLimit = this.clamp(parsedLimit, 1, 5);
    return this.calendarService.suggestDraftSlots(
      user.companyId,
      clampedDuration,
      clampedWindowDays,
      clampedLimit,
    );
  }

  @Get('capacity')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  capacityHeatmap(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'read',
    });
    return this.calendarService.getCapacityHeatmap(user.companyId, { from, to });
  }

  @Patch('schedules/:technicianId')
  @Roles('OWNER', 'ADMIN')
  updateSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('technicianId') technicianId: string,
    @Body('weeklyJson') weeklyJson?: WeeklyScheduleJson,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'mutation',
    });
    return this.calendarService.upsertScheduleSetting(
      user.companyId,
      technicianId,
      weeklyJson ?? {},
      user.sub,
    );
  }

  @Post('rota/publish')
  @Roles('OWNER', 'ADMIN')
  publishRota(
    @CurrentUser() user: JwtPayload,
    @Body('weekStart') weekStart?: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'mutation',
    });
    return this.calendarService.publishRota(user.companyId, user.sub, weekStart);
  }

  @Post('schedules/:technicianId/exceptions')
  @Roles('OWNER', 'ADMIN')
  createException(
    @CurrentUser() user: JwtPayload,
    @Param('technicianId') technicianId: string,
    @Body() body: ScheduleExceptionDto,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'mutation',
    });
    return this.calendarService.createScheduleException(user.companyId, technicianId, body);
  }

  @Delete('exceptions/:id')
  @Roles('OWNER', 'ADMIN')
  deleteException(
    @CurrentUser() user: JwtPayload,
    @Param('id') exceptionId: string,
  ) {
    featureGate({
      enabled: isSchedulingIntelligenceV1Enabled(),
      feature: 'SCHEDULING_INTELLIGENCE_V1',
      mode: 'mutation',
    });
    return this.calendarService.deleteScheduleException(user.companyId, exceptionId);
  }

  private coerceInt(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}
