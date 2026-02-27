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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatchCrmAccountDto = exports.AddCrmTaskDto = exports.AddCrmNoteDto = exports.CrmSearchQueryDto = exports.UpdateNextActionDto = exports.AddTradeAccountNoteDto = exports.TradeAccountsQueryDto = exports.UpsertTradeAccountDto = void 0;
const class_validator_1 = require("class-validator");
const constants_1 = require("../common/constants");
class UpsertTradeAccountDto {
}
exports.UpsertTradeAccountDto = UpsertTradeAccountDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "id", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "contactName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "contactEmail", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "contactPhone", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpsertTradeAccountDto.prototype, "creditLimit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpsertTradeAccountDto.prototype, "outstandingBalance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(constants_1.TRADE_ACCOUNT_STATUSES),
    __metadata("design:type", Object)
], UpsertTradeAccountDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['CALL', 'EMAIL', 'WHATSAPP', 'FOLLOW_UP', 'MEETING']),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "nextActionType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "nextActionDueAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpsertTradeAccountDto.prototype, "nextActionUserId", void 0);
class TradeAccountsQueryDto {
}
exports.TradeAccountsQueryDto = TradeAccountsQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TradeAccountsQueryDto.prototype, "q", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(constants_1.TRADE_ACCOUNT_STATUSES),
    __metadata("design:type", Object)
], TradeAccountsQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], TradeAccountsQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], TradeAccountsQueryDto.prototype, "pageSize", void 0);
class AddTradeAccountNoteDto {
}
exports.AddTradeAccountNoteDto = AddTradeAccountNoteDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddTradeAccountNoteDto.prototype, "body", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], AddTradeAccountNoteDto.prototype, "attachmentsMeta", void 0);
class UpdateNextActionDto {
}
exports.UpdateNextActionDto = UpdateNextActionDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['CALL', 'EMAIL', 'WHATSAPP', 'FOLLOW_UP', 'MEETING']),
    __metadata("design:type", String)
], UpdateNextActionDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateNextActionDto.prototype, "dueAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateNextActionDto.prototype, "assignedUserId", void 0);
class CrmSearchQueryDto {
}
exports.CrmSearchQueryDto = CrmSearchQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CrmSearchQueryDto.prototype, "q", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CrmSearchQueryDto.prototype, "segmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CrmSearchQueryDto.prototype, "tag", void 0);
class AddCrmNoteDto {
}
exports.AddCrmNoteDto = AddCrmNoteDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], AddCrmNoteDto.prototype, "bodyJson", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], AddCrmNoteDto.prototype, "attachmentsJson", void 0);
class AddCrmTaskDto {
}
exports.AddCrmTaskDto = AddCrmTaskDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddCrmTaskDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddCrmTaskDto.prototype, "details", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AddCrmTaskDto.prototype, "dueAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddCrmTaskDto.prototype, "assigneeUserId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(constants_1.CRM_TASK_STATUS_INPUTS),
    __metadata("design:type", Object)
], AddCrmTaskDto.prototype, "status", void 0);
class PatchCrmAccountDto {
}
exports.PatchCrmAccountDto = PatchCrmAccountDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PatchCrmAccountDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PatchCrmAccountDto.prototype, "contactName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], PatchCrmAccountDto.prototype, "contactEmail", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PatchCrmAccountDto.prototype, "contactPhone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(constants_1.TRADE_ACCOUNT_STATUSES),
    __metadata("design:type", Object)
], PatchCrmAccountDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], PatchCrmAccountDto.prototype, "lastContactedAt", void 0);
//# sourceMappingURL=dto.js.map