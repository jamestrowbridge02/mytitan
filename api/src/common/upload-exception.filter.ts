import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { MulterError } from "multer";
import { formatUploadBytes, UPLOAD_LIMITS } from "./upload-policy";

@Catch(MulterError)
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.code === "LIMIT_FILE_SIZE") {
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: "UPLOAD_TOO_LARGE",
        maxBytes: UPLOAD_LIMITS.video,
        maxSize: formatUploadBytes(UPLOAD_LIMITS.video),
        message: `This file is too large. Maximum allowed is ${formatUploadBytes(UPLOAD_LIMITS.video)}.`,
      });
    }
    return response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      code: "UPLOAD_REJECTED",
      message: "The upload could not be processed.",
    });
  }
}
