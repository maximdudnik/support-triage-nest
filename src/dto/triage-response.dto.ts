/**
 * Response contract re-exported for the controller layer. Keeping the HTTP
 * contract in dto/ means internal agent types can evolve without silently
 * changing the public API (here they are the same shape, by choice).
 */
export type { TriageResult as TriageResponseDto } from '../agents/agent.types';
