/**
 * Structured-output contracts for the agents, defined ONCE with zod.
 *
 * CONCEPT: Structured output.
 * One zod schema gives us three things:
 *   1. A TypeScript type (z.infer) for compile-time safety.
 *   2. A JSON Schema (z.toJSONSchema) sent to Gemini so decoding is
 *      constrained to valid JSON of this shape.
 *   3. Runtime validation of what actually came back. Even with constrained
 *      decoding, values can be semantically wrong, truncated (max tokens),
 *      or a different provider may not support schemas - so ALWAYS validate.
 *
 * `.describe()` text ends up in the JSON Schema and acts as per-field
 * instructions to the model.
 */
import { z } from 'zod';

export const CATEGORIES = ['billing', 'technical', 'account', 'general'] as const;
export type Category = (typeof CATEGORIES)[number];

export const classificationSchema = z.object({
  category: z.enum(CATEGORIES).describe('Which specialist team should handle the ticket'),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .describe('urgent = outage, security issue, or money lost right now; low = general question'),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'angry']),
  confidence: z.number().min(0).max(1).describe('How sure you are about the category, 0..1'),
  summary: z.string().max(300).describe('One-sentence summary of the customer problem'),
});
export type Classification = z.infer<typeof classificationSchema>;

export const reviewSchema = z.object({
  approved: z.boolean().describe('true only if the reply can be sent to the customer as-is'),
  toneScore: z.number().int().min(1).max(5).describe('1 = rude/robotic, 5 = empathetic and professional'),
  grounded: z
    .boolean()
    .describe('true if every factual claim (policies, numbers, timelines) is supported by the provided context or tool results'),
  issues: z.array(z.string()).describe('Concrete problems found, empty if none'),
  revisionInstructions: z.string().describe('Actionable instructions for the writer if not approved, else empty'),
});
export type Review = z.infer<typeof reviewSchema>;

/** Convert a zod schema to the JSON Schema dialect we send to the model. */
export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema; // meta key, not needed by the model API
  return json;
}
