import { BadRequestException } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';

/** Validates input with a Zod schema; responds 400 with per-field messages on failure. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!details[key]) details[key] = issue.message;
    }
    throw new BadRequestException({ code: 'VALIDATION', message: 'Please check the highlighted fields.', details });
  }
  return result.data;
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31');
export const zPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
export const zMoney = z.coerce.number().min(0, 'Must be 0 or more').max(1_00_00_00_000, 'Too large');
export const zPhone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
export const zOptText = z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null));
export const zUuid = z.string().uuid('Invalid id');
