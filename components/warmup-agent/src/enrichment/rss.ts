import type { RssItem } from '../types';

const decodeXml = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const extractTag = (block: string, tag: string): string | undefined => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ? decodeXml(match[1]) : undefined;
};

export const parseRssItems = (xml: string, limit = 5): RssItem[] => {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks.slice(0, limit)) {
    items.push({
      title: extractTag(block, 'title') ?? 'Untitled',
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate') ?? extractTag(block, 'published'),
      summary: extractTag(block, 'description') ?? extractTag(block, 'summary'),
    });
  }

  if (items.length > 0) return items;

  // Atom fallback
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of entryBlocks.slice(0, limit)) {
    items.push({
      title: extractTag(block, 'title') ?? 'Untitled',
      link: block.match(/<link[^>]+href="([^"]+)"/i)?.[1],
      pubDate: extractTag(block, 'updated') ?? extractTag(block, 'published'),
      summary: extractTag(block, 'summary') ?? extractTag(block, 'content'),
    });
  }

  return items;
};

export const fetchRssItems = async (
  feedUrl: string,
  limit = 5,
  fetchFn: typeof fetch = fetch
): Promise<RssItem[]> => {
  const response = await fetchFn(feedUrl, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed ${response.status}: ${feedUrl}`);
  }

  const xml = await response.text();
  const items = parseRssItems(xml, limit);
  if (items.length === 0) {
    throw new Error(`No RSS items found at ${feedUrl}`);
  }

  return items;
};

export const summarizeLatestPost = (items: RssItem[]): string => {
  const latest = items[0]!;
  const datePart = latest.pubDate ? ` (${latest.pubDate})` : '';
  return `Latest blog post: "${latest.title}"${datePart}`;
};
