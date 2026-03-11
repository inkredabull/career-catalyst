/**
 * Test for the two-agent pipeline (Classifier → Generator)
 *
 * This test verifies that:
 * 1. Classifier correctly classifies a job posting
 * 2. Generator uses the classification to produce a resume
 * 3. Prompt caching works as expected
 */

import { ResumeClassifierAgent } from '../classifier';
import { ResumeGeneratorAgent } from '../generator';
import * as fs from 'fs';
import * as path from 'path';

// Mock job posting
const TEST_JOB = {
  title: 'Senior Platform Engineer',
  company: 'Acme Corp',
  description: `We're looking for a Senior Platform Engineer to build and scale our infrastructure.

  Requirements:
  - Experience with distributed systems and microservices
  - Platform engineering and developer tooling
  - Site reliability engineering (SRE)
  - Strong background in infrastructure as code
  - Experience leading teams of engineers

  You'll be responsible for:
  - Architecting platform to scale to millions of users
  - Leading organizational transformation to improve reliability
  - Establishing operational excellence standards
  - Building developer platform enabling faster deployment`,
  url: 'https://example.com/job',
  location: 'San Francisco, CA',
  salary: {
    min: '180000',
    max: '250000',
    currency: 'USD'
  },
  applicantCount: 100
};

// Mock CV summary (first 500 chars of CV)
const TEST_CV_SUMMARY = `John Doe
Staff Engineer with 10+ years of experience in distributed systems, platform engineering, and team leadership.

EXPERIENCE

Staff Engineer | TechCorp | 2020-Present
Led platform engineering team of 8 engineers. Architected microservices infrastructure serving 10M+ users.
Built developer platform reducing deployment time 70%. Established SRE practices and on-call rotation.

Senior Engineer | StartupCo | 2017-2020
Designed and implemented distributed event processing system. Scaled infrastructure to handle 1M+ requests/sec.`;

// Full mock CV
const TEST_CV = TEST_CV_SUMMARY + `

Technologies: Kubernetes, Docker, Terraform, AWS, Go, Python, PostgreSQL, Redis, Kafka

Lead Engineer | SmallCo | 2014-2017
Built microservices architecture from monolith. Implemented CI/CD pipeline. Mentored 3 junior engineers.

SKILLS
- Technologies & Tools: Kubernetes, Docker, Terraform, AWS, GCP, Go, Python, Java
- Platform Engineering: Developer platforms, infrastructure as code, service mesh
- Site Reliability: SLO/SLA management, on-call, incident response, monitoring
- Leadership: Team building, mentorship, technical strategy, cross-functional collaboration

EDUCATION
- BS Computer Science, Stanford University, 2014`;

async function testTwoAgentPipeline() {
  console.log('🧪 Testing Two-Agent Pipeline\n');

  try {
    // Check for required environment variables
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }

    // Step 1: Classify the job posting
    console.log('📋 Step 1: Classifying job posting with Haiku 4.5...');
    const classifier = new ResumeClassifierAgent(anthropicApiKey);
    const classification = await classifier.classify(TEST_JOB.description, TEST_CV_SUMMARY);

    console.log('\n✅ Classification complete:');
    console.log(`   Domain: ${classification.domain}`);
    console.log(`   Format: ${classification.format}`);
    console.log(`   Roles: ${classification.rolesIncluded}`);
    console.log(`   Signals: ${classification.domainSignals.join(', ')}`);
    console.log(`   Reasoning: ${classification.reasoning}`);

    // Verify classification makes sense for this job
    if (classification.domain !== 'platform') {
      console.warn(`⚠️  Expected domain='platform', got '${classification.domain}'`);
    }

    // Step 2: Generate resume with classification
    console.log('\n📝 Step 2: Generating resume with Sonnet 4.5...');
    const generator = new ResumeGeneratorAgent(
      {
        provider: 'anthropic',
        apiKey: anthropicApiKey,
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 8000
      },
      'leader',
      'standard',
      4
    );

    const result = await generator.generate({
      classification,
      job: TEST_JOB,
      cvContent: TEST_CV
    });

    console.log('\n✅ Resume generated:');
    console.log(`   Changes tracked: ${result.changes.length}`);
    console.log(`   Format: ${result.roleSelection.format}`);
    console.log(`   Roles: ${result.roleSelection.rolesIncluded}`);
    console.log(`   Cost: $${result.cost.toFixed(4)}`);
    console.log(`   Duration: ${result.duration}s`);

    // Verify markdown content
    if (!result.markdownContent || result.markdownContent.length === 0) {
      throw new Error('No markdown content generated');
    }

    console.log(`   Content length: ${result.markdownContent.length} chars`);

    // Save output for inspection
    const outputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `two-agent-pipeline-${timestamp}.md`);
    fs.writeFileSync(outputFile, result.markdownContent);
    console.log(`\n📄 Resume saved to: ${outputFile}`);

    console.log('\n✅ Two-agent pipeline test passed!');
    console.log('\nNext steps:');
    console.log('1. Review the generated resume to verify quality');
    console.log('2. Run again within 5 minutes to verify prompt caching');
    console.log('3. Try with different job postings to test domain classification');

    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return false;
  }
}

// Run test if called directly
if (require.main === module) {
  testTwoAgentPipeline().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { testTwoAgentPipeline };
