export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "conflict"
  | "internal";

export type ApiErrorBody = {
  error: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, "bad_request", message, details);
}

export function notFound(message: string, details?: unknown) {
  return new ApiError(404, "not_found", message, details);
}

export function conflict(message: string, details?: unknown) {
  return new ApiError(409, "conflict", message, details);
}
