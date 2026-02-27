import { randomBytes, randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function generateRequestId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return randomBytes(16).toString('hex');
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const inbound = req.header(REQUEST_ID_HEADER);
  const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : generateRequestId();

  (req as any).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
