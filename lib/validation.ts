import type { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Runtime validation of request bodies at the API boundary. (review M1)
 *
 * Unknown keys are stripped (zod default), which also blocks mass-assignment of
 * internal fields. On failure returns a 400 NextResponse with field-level
 * issues; on success returns the typed, parsed value.
 */
export function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Invalid request body',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    ),
  };
}
