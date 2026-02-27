import { IsBoolean, IsInt, IsObject, IsOptional } from "class-validator";

export class GuidedSetupStepDto {
  @IsInt()
  step!: number;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}
