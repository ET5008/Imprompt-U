import { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = (err as { status?: number }).status ?? 500;
  const message: string = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(status).json({ error: message });
};
