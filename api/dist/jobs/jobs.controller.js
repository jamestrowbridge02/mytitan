"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const constants_1 = require("../common/constants");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const jobs_service_1 = require("./jobs.service");
let JobsController = class JobsController {
    constructor(jobsService) {
        this.jobsService = jobsService;
    }
    create(user, dto) {
        return this.jobsService.create(user.companyId, user.sub, dto);
    }
    list(user) {
        return this.jobsService.list(user.companyId);
    }
    board(user, query) {
        const fallback = (0, feature_gate_1.featureGate)({
            enabled: (0, feature_flags_1.isCommandCentreV1Enabled)(),
            feature: 'COMMAND_CENTRE_V1',
            mode: 'read',
            fallback: { grouped: {}, counts: {} },
        });
        if (fallback)
            return fallback;
        return this.jobsService.board(user.companyId, user.sub, query);
    }
    boardV2(user, query) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
        return this.jobsService.boardV2(user.companyId, user.sub, query);
    }
    getById(user, id) {
        return this.jobsService.getById(user.companyId, id);
    }
    generatePdf(user, id) {
        return this.jobsService.generatePdf(user.companyId, user.sub, id);
    }
    updateStatus(user, id, dto) {
        const normalized = (0, constants_1.normalizeJobStatusInput)(dto.status);
        if (!normalized) {
            throw new common_1.BadRequestException({ code: "INVALID_STATUS", allowed: constants_1.JOB_STATUSES });
        }
        return this.jobsService.updateStatus(user.companyId, user.sub, id, normalized);
    }
    patchInline(user, id, dto) {
        return this.jobsService.patchPartial(user.companyId, user.sub, id, dto);
    }
    bulk(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV1Enabled)(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
        return this.jobsService.bulk(user.companyId, user.sub, dto);
    }
    bulkV2(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
        return this.jobsService.bulkV2(user.companyId, user.sub, dto);
    }
    reminder(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
        return this.jobsService.createReminder(user.companyId, user.sub, dto);
    }
    activity(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
        return this.jobsService.activity(user.companyId, id);
    }
    undoLast(user) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV1Enabled)(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
        return this.jobsService.undoLastChange(user.companyId, user.sub);
    }
};
exports.JobsController = JobsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CreateJobDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)("board"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.JobsBoardQueryDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "board", null);
__decorate([
    (0, common_1.Get)("board-v2"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.JobsBoardQueryDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "boardV2", null);
__decorate([
    (0, common_1.Get)(":id"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(":id/pdf"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "generatePdf", null);
__decorate([
    (0, common_1.Patch)(":id/status"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.UpdateJobStatusDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(":id"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.PatchJobDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "patchInline", null);
__decorate([
    (0, common_1.Post)("bulk"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.BulkJobsDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "bulk", null);
__decorate([
    (0, common_1.Post)("bulk-v2"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.BulkJobsV2Dto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "bulkV2", null);
__decorate([
    (0, common_1.Post)("reminder"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CreateJobReminderDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "reminder", null);
__decorate([
    (0, common_1.Get)(":id/activity"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "activity", null);
__decorate([
    (0, common_1.Post)('undo-last'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "undoLast", null);
exports.JobsController = JobsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)("jobs"),
    __metadata("design:paramtypes", [jobs_service_1.JobsService])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map