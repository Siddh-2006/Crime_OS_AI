import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'joi';
import { ValidationError } from '../errors/ValidationError';

/**
 * Generic Joi validation middleware factory.
 * Validates req.body against the provided schema.
 * On failure, throws ValidationError with flattened details.
 */
export function validate(schema: ObjectSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return next(new ValidationError('Validation failed', details));
    }

    // Replace req.body with the sanitized value
    req.body = value;
    next();
  };
}
