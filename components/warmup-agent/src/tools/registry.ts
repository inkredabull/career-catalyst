/**
 * Curated tool registry — Zero-inspired, but fixed to ~12 tools we actually use.
 * Tracks per-tool health signals for the Observe/Correct phases.
 */

export type ToolName =
  | 'google_people'
  | 'gmail_drafts'
  | 'warmup_sheet'
  | 'blog_rss'
  | 'contact_notes'
  | 'enrichlayer_profile'
  | 'twitter_handle'
  | 'linkedin_activity_cache'
  | 'bedrock_planner'
  | 'bedrock_generator'
  | 'bedrock_judge'
  | 'digest_email';

export interface ToolHealth {
  name: ToolName;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  lastError?: string;
  lastUsedAt?: string;
}

export interface ToolInvokeResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
}

type ToolHandler<TArgs, TResult> = (args: TArgs) => Promise<TResult>;

interface RegisteredTool<TArgs = unknown, TResult = unknown> {
  name: ToolName;
  description: string;
  costHint: 'free' | 'low' | 'medium';
  handler: ToolHandler<TArgs, TResult>;
}

export class ToolRegistry {
  private tools = new Map<ToolName, RegisteredTool>();
  private health = new Map<ToolName, ToolHealth>();

  register<TArgs, TResult>(
    name: ToolName,
    description: string,
    costHint: 'free' | 'low' | 'medium',
    handler: ToolHandler<TArgs, TResult>
  ): void {
    this.tools.set(name, { name, description, costHint, handler } as RegisteredTool);
    this.health.set(name, { name, successCount: 0, failureCount: 0, totalLatencyMs: 0 });
  }

  list(): Array<{ name: ToolName; description: string; costHint: string }> {
    return [...this.tools.values()].map(t => ({
      name: t.name,
      description: t.description,
      costHint: t.costHint,
    }));
  }

  getHealth(): ToolHealth[] {
    return [...this.health.values()].sort(
      (a, b) => b.failureCount / Math.max(1, b.successCount + b.failureCount)
        - a.failureCount / Math.max(1, a.successCount + a.failureCount)
    );
  }

  async invoke<TArgs, TResult>(
    name: ToolName,
    args: TArgs
  ): Promise<ToolInvokeResult<TResult>> {
    const tool = this.tools.get(name);
    const stats = this.health.get(name);
    if (!tool || !stats) {
      return { ok: false, error: `Unknown tool: ${name}`, latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const data = await (tool.handler as ToolHandler<TArgs, TResult>)(args);
      const latencyMs = Date.now() - start;
      stats.successCount += 1;
      stats.totalLatencyMs += latencyMs;
      stats.lastUsedAt = new Date().toISOString();
      return { ok: true, data, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      stats.failureCount += 1;
      stats.totalLatencyMs += latencyMs;
      stats.lastError = error instanceof Error ? error.message : String(error);
      stats.lastUsedAt = new Date().toISOString();
      return { ok: false, error: stats.lastError, latencyMs };
    }
  }
}

export const createDefaultRegistry = (): ToolRegistry => new ToolRegistry();
