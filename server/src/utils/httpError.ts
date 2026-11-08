export class HttpError extends Error {
  readonly code: string;
  constructor(readonly status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpError';
    this.code = ({400:'INVALID_REQUEST',401:'UNAUTHORIZED',403:'INELIGIBLE',404:'NOT_FOUND',409:'CONFLICT',502:'UPSTREAM_UNAVAILABLE',503:'SERVICE_UNAVAILABLE'} as Record<number,string>)[status] ?? 'REQUEST_FAILED';
  }
}

export class ValidationError extends HttpError {
  constructor(readonly fields: Record<string, string>) {
    super(400, 'Please correct the highlighted book details.');
    this.name = 'ValidationError';
  }
}
