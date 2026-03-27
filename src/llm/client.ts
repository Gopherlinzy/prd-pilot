import OpenAI from 'openai';

// ============================================================
// Unified LLM Client
// Wraps OpenAI SDK with retry, structured output, and config
// ============================================================

export interface LLMClientConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Base URL for API-compatible providers */
  baseUrl?: string;
  /** Default model to use */
  model?: string;
  /** Default temperature */
  temperature?: number;
  /** Max tokens for completion */
  maxTokens?: number;
  /** Max retry attempts on transient errors */
  maxRetries?: number;
}

const DEFAULT_CONFIG: Required<LLMClientConfig> = {
  apiKey: process.env.OPENAI_API_KEY ?? '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  temperature: 0.2,
  maxTokens: 4096,
  maxRetries: 3,
};

/**
 * LLMClient — unified interface for LLM calls.
 *
 * Features:
 * - Structured JSON output via response_format
 * - Automatic retry with exponential backoff
 * - Configurable model/temperature/tokens
 * - Compatible with any OpenAI-API-compatible provider
 */
export class LLMClient {
  private client: OpenAI;
  private config: Required<LLMClientConfig>;

  constructor(config: LLMClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Send a prompt and get a text response.
   */
  async complete(prompt: string, options?: Partial<LLMClientConfig>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.config.model,
      temperature: options?.temperature ?? this.config.temperature,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Send a prompt and get a structured JSON response.
   * Uses OpenAI's JSON mode for reliable parsing.
   *
   * @param prompt - The user prompt
   * @param systemPrompt - System prompt to set context
   * @returns Parsed JSON object
   */
  async structured<T>(
    prompt: string,
    systemPrompt: string = 'You are a helpful assistant. Respond in valid JSON.',
  ): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(content) as T;
  }
}
