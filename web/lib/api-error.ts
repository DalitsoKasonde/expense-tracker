export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function isApiNotFound(error: unknown) {
  return error instanceof ApiRequestError && error.status === 404;
}
