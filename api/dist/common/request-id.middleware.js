"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const crypto_1 = require("crypto");
const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
function generateRequestId() {
    if (typeof crypto_1.randomUUID === 'function') {
        return (0, crypto_1.randomUUID)();
    }
    return (0, crypto_1.randomBytes)(16).toString('hex');
}
function requestIdMiddleware(req, res, next) {
    const inbound = req.header(REQUEST_ID_HEADER);
    const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : generateRequestId();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
}
//# sourceMappingURL=request-id.middleware.js.map