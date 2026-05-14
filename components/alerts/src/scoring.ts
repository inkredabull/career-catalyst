import { scoreJD } from '../../scorer/src/scorer';
import { JobResult } from './linkedin';
import { log } from './utils/logger';

export async function scoreJob(job: JobResult): Promise<'🟢' | '🟡' | '🔴' | '?'> {
  try {
    const scorecard = await scoreJD(job.url);
    if (scorecard.includes('🟢')) return '🟢';
    if (scorecard.includes('🟡')) return '🟡';
    if (scorecard.includes('🔴')) return '🔴';
    log('WARN', 'Could not parse verdict for %s — %s', job.company, job.title);
    return '?';
  } catch (err) {
    log('WARN', 'Scoring failed for %s — %s: %s', job.company, job.title, (err as Error).message);
    return '?';
  }
}
