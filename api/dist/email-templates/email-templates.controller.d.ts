import { JwtPayload } from '../auth/auth.types';
import { UpsertEmailTemplateDto } from './email-templates.dto';
import { EmailTemplatesService } from './email-templates.service';
export declare class EmailTemplatesController {
    private readonly emailTemplatesService;
    constructor(emailTemplatesService: EmailTemplatesService);
    list(user: JwtPayload): any;
    getById(user: JwtPayload, id: string): Promise<any>;
    create(user: JwtPayload, dto: UpsertEmailTemplateDto): Promise<any>;
    update(user: JwtPayload, id: string, dto: UpsertEmailTemplateDto): Promise<any>;
    remove(user: JwtPayload, id: string): Promise<{
        deleted: boolean;
    }>;
}
