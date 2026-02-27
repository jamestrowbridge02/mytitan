import { EMAIL_TEMPLATE_TYPES } from '../common/constants';
export declare class UpsertEmailTemplateDto {
    type: (typeof EMAIL_TEMPLATE_TYPES)[number];
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
}
