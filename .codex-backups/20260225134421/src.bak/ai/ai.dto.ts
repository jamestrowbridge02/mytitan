import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AiChatDto {
  @IsString()
  @MaxLength(6000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  purpose?: string;
}
