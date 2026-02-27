import { JwtPayload } from '../auth/auth.types';
import { AiChatDto } from './ai.dto';
import { AiService } from './ai.service';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    chat(user: JwtPayload, dto: AiChatDto): Promise<{
        model: string;
        message: string;
        usage?: undefined;
    } | {
        model: string;
        message: string;
        usage: {
            inputTokens: any;
            outputTokens: any;
            totalTokens: any;
        };
    }>;
}
