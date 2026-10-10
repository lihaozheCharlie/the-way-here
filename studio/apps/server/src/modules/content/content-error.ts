export class ContentRequestError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
