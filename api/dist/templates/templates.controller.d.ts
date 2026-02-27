import { JwtPayload } from "../auth/auth.types";
import { TemplatesService } from "./templates.service";
export declare class TemplatesController {
    private readonly templatesService;
    constructor(templatesService: TemplatesService);
    getDefault(user: JwtPayload, trade?: string): Promise<{
        template: any;
        fields: any[];
        reason: string;
    } | {
        template: any;
        fields: any;
        reason?: undefined;
    }>;
}
