import type { Article, PublishedArticle, Section, SectionKey } from '@/lib/content/types';
import { theBondComeback } from './articles/the-bond-comeback';
import { previews } from './articles/previews';

export const sections: Section[] = [
  { key: 'markets', name: 'Markets', description: 'Bonds, stocks and the forces that move prices.' },
  { key: 'economy', name: 'Economy', description: 'Growth, inflation, jobs and the decisions of central banks.' },
  { key: 'technology', name: 'Technology', description: 'The money behind the innovations reshaping the economy.' },
  { key: 'wealth', name: 'Wealth', description: 'What the big picture means for savers and long-term investors.' },
];

/** The homepage lead story. */
export const leadStory: PublishedArticle = theBondComeback;

/** All stories, newest first. Phase 3 replaces this with a database query. */
export const articles: Article[] = [theBondComeback, ...previews];

export const getArticle = (slug: string) => articles.find((a) => a.slug === slug);
export const getSection = (key: string) => sections.find((s) => s.key === key);
export const articlesInSection = (key: SectionKey) => articles.filter((a) => a.section === key);
export const sectionName = (key: SectionKey) => getSection(key)?.name ?? key;
