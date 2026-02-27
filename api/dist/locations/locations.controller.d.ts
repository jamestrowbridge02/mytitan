import { JwtPayload } from '../auth/auth.types';
import { UpsertLocationDto } from './dto';
import { LocationsService } from './locations.service';
export declare class LocationsController {
    private readonly locationsService;
    constructor(locationsService: LocationsService);
    list(user: JwtPayload): any[] | Promise<any>;
    create(user: JwtPayload, dto: UpsertLocationDto): Promise<any>;
    update(user: JwtPayload, id: string, dto: UpsertLocationDto): Promise<any>;
    archive(user: JwtPayload, id: string): Promise<any>;
    setStaffRestriction(user: JwtPayload, body: {
        onlyMyLocation?: boolean;
    }): Promise<{
        ok: boolean;
        onlyMyLocation: boolean;
    }>;
}
