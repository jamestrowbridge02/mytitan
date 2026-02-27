import { IsIn } from 'class-validator';
import { PLAN_DEFINITIONS } from './billing.constants';

const PLAN_CODES = Object.keys(PLAN_DEFINITIONS);
const INTERVALS = ['MONTHLY', 'ANNUAL'];

export class CheckoutSessionDto {
  @IsIn(PLAN_CODES)
  planCode!: string;

  @IsIn(INTERVALS)
  interval!: 'MONTHLY' | 'ANNUAL';
}
