/**
 * SpecialistRegistry - maps a category to its specialist agent.
 *
 * CONCEPT: Strategy pattern via DI. The orchestrator asks "give me the agent
 * for 'billing'" and does not know concrete classes. The list itself is
 * built by a useFactory provider (see agents.module.ts) under the
 * SPECIALIST_AGENTS token - adding a specialist = register one more class.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Category } from '../schemas';
import { SpecialistAgent } from './specialist.agent';

export const SPECIALIST_AGENTS = Symbol('SPECIALIST_AGENTS');

@Injectable()
export class SpecialistRegistry {
  private readonly byCategory: Map<Category, SpecialistAgent>;

  constructor(@Inject(SPECIALIST_AGENTS) agents: SpecialistAgent[]) {
    this.byCategory = new Map(agents.map((a) => [a.category, a]));
  }

  get(category: Category): SpecialistAgent {
    // 'general' is the safe default if a category has no dedicated agent.
    const agent = this.byCategory.get(category) ?? this.byCategory.get('general');
    if (!agent) throw new Error(`No specialist registered for "${category}" and no general fallback`);
    return agent;
  }

  categories(): Category[] {
    return [...this.byCategory.keys()];
  }
}
