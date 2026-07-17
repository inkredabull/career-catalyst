import { ToolRegistry } from '../src/tools/registry';

describe('ToolRegistry', () => {
  it('tracks success and failure health', async () => {
    const registry = new ToolRegistry();
    registry.register('blog_rss', 'Fetch blog RSS', 'free', async () => ({ posts: [] }));
    registry.register('contact_notes', 'Read notes', 'free', async () => {
      throw new Error('no notes');
    });

    const ok = await registry.invoke('blog_rss', {});
    const fail = await registry.invoke('contact_notes', {});

    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);

    const health = registry.getHealth();
    const rss = health.find(h => h.name === 'blog_rss');
    const notes = health.find(h => h.name === 'contact_notes');
    expect(rss?.successCount).toBe(1);
    expect(notes?.failureCount).toBe(1);
  });

  it('lists registered tools', () => {
    const registry = new ToolRegistry();
    registry.register('gmail_drafts', 'Create drafts', 'free', async () => true);
    expect(registry.list()).toHaveLength(1);
  });
});
