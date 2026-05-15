/**
 * One-time migration: seeds alerts/stop-lists.json in Vercel Blob with
 * the existing GAS Script Properties stop-list data.
 *
 * Run from components/alerts/: npx ts-node scripts/seed-stop-lists.ts
 * Requires BLOB_READ_WRITE_TOKEN in .env.local (run `vercel env pull .env.local` first).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

import { put } from '@vercel/blob';

const data = {
  companies: [
    'Confidential',
    'Excelra',
    'Beauty by Imagination',
    'Career2Franchise',
    'Rad AI',
    'Ladders',
    'Saragossa',
    'Entegris',
    'Storm4',
    'HiredChina.com国际人才招聘网',
    'InGenivm Group',
    'Decentralized Masters',
    'IMPaCT Care',
    'Revelation Pharma',
    'hackajob',
  ],
  titles: [
    'Head of Talent Acquisition',
    'Head of Artificial Intelligence',
    'Chief Executive Officer',
    'Senior Director, Revenue Cycle Operations',
    'Strategy Advancement Principle',
    'Creative Director',
    'Senior Finance Manager',
    'Director of Finance',
    'VP of Sales and Revenue',
    'Director, Global Payroll',
    'Plant Director',
    'System Finance Director',
    'VP, Finance & Accounting',
    'Vice President Operations',
    'Director, Product Marketing',
    'B2B Marketing Director',
    'Chief of Staff to the CEO',
    'Director of Revenue Operations',
    'Vice President, Customer Success',
    'Head of Payments Systems',
    'Commercial Analytics',
    'Associate Director',
    'Product Operations',
    'Senior Director of Education and Meetings',
    'VP, Underwriting',
    'National Director',
    'Head of Strategic Partnerships',
    'Director, Revenue Operations',
    'Director, Fraud Strategy and Operations',
    'Director, Strategic Alliances',
    'Chief of Staff to CFO',
    'Material Services',
    'Head of Defense Growth',
    'Director of Electrical Engineering',
    'VP Private Equity',
    'Principal AI Engineer',
    'Director, Brand and Creative Operations',
    'Senior Director, Strategy',
    'Vice President, Demand Generation',
    'Director of Performance Marketing',
    'Head of Product',
    'Director of Operations',
    'Head of Sales',
    'Director of Customer Success',
    'Director of Customer Experience',
    'Director, External Manufacturing',
    'Director, Partner Marketing',
    'Director of Forensic Engineering',
    'Director of Mechanical Engineering',
    'Director, Software Development & Engineering (Portfolio Management Technology - AI Driven Transformation)',
    'Director, Software Development & Engineering Senior (PL) - Crypto Technology',
    'Director of Engineering, I/O',
    'Director of AI & Legal Innovation',
    'Senior Director of AI & Enterprise Architecture',
    'Director of AI Architecture',
    'Director, Core Engineering',
    'Director of Engineering, Infrastructure & Platform',
    'VP/Head of Enterprise Engineering',
    'Director of AI',
    'Business Development Director',
    'Regional CTO - Remote Work',
    'Vice President, Information Technology',
    'Chief of Staff (CoS), Commercial',
    'Head of Technical Recruiting',
    'Director - Technologies',
    'Director of Accounting',
    'VP, Product Strategy',
  ],
};

async function main(): Promise<void> {
  console.log(`Seeding stop lists (${data.companies.length} companies, ${data.titles.length} titles)...`);
  const blob = await put('alerts/stop-lists.json', JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
  });
  console.log(`Done: ${blob.url}`);
}

main().catch(err => { console.error(err); process.exit(1); });
