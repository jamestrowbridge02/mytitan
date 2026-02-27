"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureGate = featureGate;
const common_1 = require("@nestjs/common");
function featureGate({ enabled, feature, mode, fallback }) {
    if (enabled)
        return undefined;
    if (mode === 'read' && fallback !== undefined)
        return fallback;
    throw new common_1.HttpException({ code: 'FEATURE_DISABLED', feature }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
}
//# sourceMappingURL=feature-gate.js.map