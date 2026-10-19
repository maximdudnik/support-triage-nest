/**
 * Tool abstraction for function calling.
 *
 * CONCEPT: A "tool" = declaration (name, description, JSON Schema of args)
 * that the MODEL reads + an `execute` function that OUR code runs.
 * The description is a prompt: the model decides when to call the tool
 * based on it, so write it like documentation for a junior colleague.
 *
 * SECURITY: Arguments come from the model, and the model reads user input,
 * so treat args as UNTRUSTED user input: validate them (zod), authorise,
 * and never pass them to eval/shell/raw SQL.
 */
import { ToolDeclaration } from '../llm/llm.types';

export interface AgentTool {
  readonly declaration: ToolDeclaration;
  /** Must not throw for "expected" failures - return { error } so the model can react. */
  execute(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}
