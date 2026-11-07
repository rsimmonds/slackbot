import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { models, type AgentStep, type ModelId } from './models';

export interface CompletionRequest {
  step: AgentStep;
  model: ModelId;
  system: string;
  user: string;
  schema: z.ZodType;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CompletionResponse {
  /** Parsed output, not yet trusted: runAgent validates it with the schema. */
  output: unknown;
  /** Set when the model returned something unusable (refusal, truncation, unparseable JSON). */
  invalidReason?: string;
  usage: Usage;
  /** The model that actually served the request (may differ after a refusal fallback). */
  servedModel: string;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'fake';
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

const zeroUsage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Server-side refusal fallback is offered for Sonnet/Opus on the Claude API, not for Haiku. */
const supportsFallback = (m: ModelId) => m === models.sonnet || m === models.opus;

/**
 * Claude API provider. Structured outputs (`output_config.format`) guarantee schema-shaped JSON;
 * the system prompt is cached (stable prefix, volatile input only in the user turn).
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  constructor(private readonly client = new Anthropic({ maxRetries: 2, timeout: 60_000 })) {}

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const fallback = supportsFallback(req.model);
    let res;
    try {
      res = await this.client.beta.messages.parse({
        model: req.model,
        max_tokens: req.maxTokens,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
        ...(fallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
    } catch (error) {
      // Transport and API errors (429, 5xx, auth) are operational: let the job retry them.
      if (error instanceof Anthropic.APIError) throw error;
      // Anything else is the SDK failing to parse/validate the model's JSON: invalid output.
      return {
        output: undefined,
        invalidReason: `unparseable output: ${(error as Error).message}`,
        usage: zeroUsage,
        servedModel: req.model,
      };
    }

    const usage: Usage = {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
      cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
    };
    const base = { usage, servedModel: res.model };
    if (res.stop_reason === 'refusal') {
      const category = res.stop_details?.category ?? 'unspecified';
      return { ...base, output: undefined, invalidReason: `refusal (${category})` };
    }
    if (res.stop_reason === 'max_tokens')
      return { ...base, output: undefined, invalidReason: 'output truncated at max_tokens' };
    if (res.parsed_output == null)
      return { ...base, output: undefined, invalidReason: 'no structured output returned' };
    return { ...base, output: res.parsed_output };
  }
}

/** Stable key for a request: the step plus the exact user message. */
export const requestKey = (step: AgentStep, user: string) =>
  createHash('sha256').update(`${step}\n${user}`).digest('hex').slice(0, 24);

export type Fallback = (req: CompletionRequest) => unknown;

/**
 * Offline provider for dev, CI and e2e. Replays recorded outputs keyed by request, otherwise runs
 * a deterministic fallback for the step. Never touches the network.
 */
export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;
  constructor(
    private readonly recorded: ReadonlyMap<string, unknown> = new Map(),
    private readonly fallbacks: Partial<Record<AgentStep, Fallback>> = {},
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const key = requestKey(req.step, req.user);
    const usage = {
      input: Math.ceil((req.system.length + req.user.length) / 4),
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    let output: unknown;
    if (this.recorded.has(key)) output = this.recorded.get(key);
    else if (this.fallbacks[req.step]) output = this.fallbacks[req.step]!(req);
    else
      return {
        output: undefined,
        invalidReason: `no fake output for ${req.step}`,
        usage,
        servedModel: 'fake',
      };
    usage.output = Math.ceil(JSON.stringify(output ?? null).length / 4);
    return { output, usage, servedModel: 'fake' };
  }
}
