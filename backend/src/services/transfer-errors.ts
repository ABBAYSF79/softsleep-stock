export class TransferDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TransferDomainError';
    this.code = code;
  }
}

export function transferErrorToHttp(error: unknown): { status: number; body: { error: string; code?: string } } {
  if (error instanceof TransferDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN_STATUS'
          ? 409
          : error.code === 'CANCELLATION_NOT_ALLOWED'
            ? 400
            : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: 'Internal transfer error' } };
}
