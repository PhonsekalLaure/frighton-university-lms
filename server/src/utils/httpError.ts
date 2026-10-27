export class HttpError extends Error {
  constructor(readonly status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpError';
  }
}

export class ValidationError extends HttpError {
  constructor(readonly fields: Record<string, string>) {
    super(400, 'Please correct the highlighted book details.');
    this.name = 'ValidationError';
  }
}
