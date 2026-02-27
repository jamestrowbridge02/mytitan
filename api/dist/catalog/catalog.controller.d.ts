import { JwtPayload } from '../auth/auth.types';
import { UpsertCatalogItemDto } from './catalog.dto';
import { CatalogService } from './catalog.service';
export declare class CatalogController {
    private readonly catalogService;
    constructor(catalogService: CatalogService);
    list(user: JwtPayload): any;
    getById(user: JwtPayload, id: string): Promise<any>;
    create(user: JwtPayload, dto: UpsertCatalogItemDto): Promise<any>;
    update(user: JwtPayload, id: string, dto: UpsertCatalogItemDto): Promise<any>;
    remove(user: JwtPayload, id: string): Promise<{
        deleted: boolean;
    }>;
}
