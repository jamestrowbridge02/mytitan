import { IsString } from 'class-validator';

export class TradePackMutationDto {
  @IsString()
  packCode!: string;
}
