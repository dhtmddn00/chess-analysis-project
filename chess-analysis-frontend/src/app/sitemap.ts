import type { MetadataRoute } from 'next';

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://chesslab.kr';

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ['ko', 'en'];
  const staticPages = ['', '/analyze', '/history', '/compare', '/community'];
  const lowPriorityPages = ['/privacy', '/terms'];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of staticPages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === '' ? 'daily' : 'weekly',
        priority: page === '' ? 1.0 : 0.8,
      });
    }
    for (const page of lowPriorityPages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      });
    }
  }

  return entries;
}
