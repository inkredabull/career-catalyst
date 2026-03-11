# Parallel Resume Generation

Generate multiple resumes simultaneously using different LLM models for side-by-side comparison.

## Overview

The parallel resume generation system creates tailored resumes using 2-3 different LLM models in parallel, allowing you to compare output quality, writing styles, and model capabilities.

### Architecture

```
Step 1: Classification (SHARED - ~3-5s)
    ↓
[Classifier: Haiku 4.5] - Analyzes job posting once
    ↓
[domain, format, rolesIncluded, reasoning]
    ↓
Step 2: Parallel Generation (~15-20s each, simultaneous)
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│ Claude Sonnet   │ Claude Haiku    │ GPT-4o          │
│ 4.5             │ 4.5             │                 │
│ ~$0.11          │ ~$0.03          │ ~$0.08          │
└─────────────────┴─────────────────┴─────────────────┘
    ↓
[3 PDFs organized in comparison folder]
```

**Key Benefits:**
- ⚡ **Fast**: ~25s for 3 resumes (vs ~60-90s sequential)
- 💰 **Cost-effective**: ~$0.22 total with prompt caching
- 🎯 **Consistent**: Shared classification ensures fair comparison
- 🔄 **Resilient**: Partial failures don't block other models

## Configured Models

The default configuration (`parallel-config.json`) uses 3 models:

| # | Model | Provider | Model ID | Cost | Speed | Best For |
|---|-------|----------|----------|------|-------|----------|
| 1 | **Claude Sonnet 4.5** | Anthropic | `claude-sonnet-4-5-20250929` | ~$0.11 | Medium | Balanced quality & speed, best overall |
| 2 | **Claude Haiku 4.5** | Anthropic | `claude-haiku-4-5-20251001` | ~$0.03 | Fast | Speed & cost optimization |
| 3 | **GPT-4o** | OpenAI | `gpt-4o` | ~$0.08 | Medium | Alternative perspective, OpenAI style |

### Classifier Model

**All parallel runs share a single classifier:**
- **Model**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- **Cost**: ~$0.001 per classification
- **Speed**: ~3-5 seconds
- **Purpose**: Determines domain, format, and roles (shared across all generators)

## Quick Start

### 1. Prerequisites

Ensure your `.env` file has the required settings:

```bash
# Required: API keys
ANTHROPIC_API_KEY=sk-ant-...                    # Required for classifier + Claude models
OPENAI_API_KEY=sk-...                           # Only if using GPT models

# Required: Model configuration (used if parallel-config.json doesn't exist)
RESUME_LLM_PROVIDER=anthropic                   # or "openai"
RESUME_LLM_MODEL=claude-sonnet-4-5-20250929     # Primary model
CRITIQUE_LLM_PROVIDER=anthropic                 # or "openai"
CRITIQUE_LLM_MODEL=claude-sonnet-4-5-20250929   # Critique model (optional if same as primary)

# Optional: Custom output directory
RESUME_OUTPUT_DIR=~/Google Drive/My Drive/Professional/Job Search/Applications/Resumes

# Optional: Auto-confirm costs without prompt
LLM_AUTO_CONFIRM=true
```

**Important:** The `parallel-config.json` file is **optional**. If not present, the system will automatically use the models configured in your `.env` file (RESUME_LLM_* and CRITIQUE_LLM_* settings). Create `parallel-config.json` only if you want to compare 3+ different models.

### 2. Basic Usage

```bash
# Generate resumes with all 3 configured models
npm run dev parallel-resume <jobId>

# Use only 2 models (first 2 from config)
npm run dev parallel-resume <jobId> --num-models 2

# Provide custom CV file
npm run dev parallel-resume <jobId> ~/my-cv.txt

# Skip critique workflow for faster generation
npm run dev parallel-resume <jobId> --no-critique
```

### 3. Example Output

```
🚀 Parallel Resume Generation
================================

📋 Job: Senior Platform Engineer at Acme Corp
📊 Models: 3 (Claude Sonnet 4.5, Claude Haiku 4.5, GPT-4o)

📍 Step 1: Classification (shared)
──────────────────────────────────
🔍 Classifying job posting with claude-haiku-4-5-20251001...
⏱️  Classifier elapsed: 3.4s (complete)
✅ Classification: domain=platform, format=split, roles=5
   Signals: platform engineering, infrastructure, distributed systems

📝 Step 2: Parallel Generation
──────────────────────────────────
💰 Parallel Resume Generation Cost Estimate
═══════════════════════════════════════════
   Claude Sonnet 4.5: ~$0.1100
   Claude Haiku 4.5: ~$0.0300
   GPT-4o: ~$0.0800
───────────────────────────────────────────
   Total estimated: ~$0.2200

Proceed? (y/n): y

📁 Step 3: PDF Generation & Organization
──────────────────────────────────
📂 Comparison folder: ~/Google Drive/.../Comparisons/abc123-AcmeCorp-2026-03-11/

✅ Claude Sonnet 4.5: $0.1142 (17.3s)
✅ Claude Haiku 4.5: $0.0289 (9.8s)
✅ GPT-4o: $0.0847 (14.1s)

✅ Parallel Resume Generation Complete
════════════════════════════════════════
💰 Total cost: $0.2278
📊 Success rate: 3/3 models
📂 Output: ~/Google Drive/.../Comparisons/abc123-AcmeCorp-2026-03-11/
```

## File Organization

Resumes are organized in timestamped comparison folders:

```
~/Google Drive/.../Resumes/
└── Comparisons/
    └── abc123-AcmeCorp-2026-03-11/
        ├── comparison-metadata.json
        ├── [Claude Sonnet 4.5] John Doe for Senior Platform Engineer at Acme Corp.pdf
        ├── [Claude Haiku 4.5] John Doe for Senior Platform Engineer at Acme Corp.pdf
        └── [GPT-4o] John Doe for Senior Platform Engineer at Acme Corp.pdf
```

### Metadata File

`comparison-metadata.json` contains:

```json
{
  "jobId": "abc123",
  "company": "Acme Corp",
  "role": "Senior Platform Engineer",
  "timestamp": "2026-03-11T10:30:00.000Z",
  "classification": {
    "domain": "platform",
    "format": "split",
    "rolesIncluded": 5,
    "reasoning": "Platform engineering role with leadership scope",
    "domainSignals": ["platform engineering", "infrastructure", "distributed systems"]
  },
  "results": [
    {
      "model": "Claude Sonnet 4.5",
      "success": true,
      "cost": 0.1142,
      "duration": 17.3,
      "pdfFilename": "[Claude Sonnet 4.5] John Doe for Senior Platform Engineer at Acme Corp.pdf"
    }
  ],
  "costs": {
    "classification": 0.0010,
    "generation": 0.2268,
    "total": 0.2278
  },
  "successCount": 3,
  "failureCount": 0
}
```

## Configuration

### Default Behavior (No Config File)

**If `parallel-config.json` doesn't exist**, the system automatically generates configuration from your `.env` file:

```bash
# In your .env:
RESUME_LLM_PROVIDER=anthropic
RESUME_LLM_MODEL=claude-sonnet-4-5-20250929
CRITIQUE_LLM_PROVIDER=anthropic
CRITIQUE_LLM_MODEL=claude-haiku-4-5-20251001
```

**Results in:**
- Model 1: Claude Sonnet 4.5 (from RESUME_LLM_*)
- Model 2: Claude Haiku 4.5 (from CRITIQUE_LLM_*, only if different)

This gives you 1-2 models automatically with **no additional configuration needed**.

### Customizing Models (Advanced)

**Create `parallel-config.json`** only if you want to:
- Compare 3+ models simultaneously
- Use specific model combinations
- Fine-tune generation settings per comparison

**To customize:**

```bash
# Copy the example template
cp parallel-config.example.json parallel-config.json

# Edit your copy (this file is gitignored)
vim parallel-config.json
```

**Configuration format:**

```json
{
  "models": [
    {
      "label": "Claude Sonnet 4.5",        // Display name
      "provider": "anthropic",             // anthropic | openai
      "model": "claude-sonnet-4-5-20250929", // Model ID
      "maxTokens": 8000                    // Max output tokens
    }
  ],
  "sharedSettings": {
    "maxRoles": 4,                         // Roles to consider from CV
    "temperature": 0.3,                    // Generation randomness (0-1)
    "mode": "leader",                      // leader | builder
    "experienceFormat": "standard"         // standard | split
  }
}
```

### Adding More Models

You can add any compatible model:

**Anthropic Models:**
```json
{
  "label": "Claude Opus 4.5",
  "provider": "anthropic",
  "model": "claude-opus-4-5-20251101",
  "maxTokens": 8000
}
```

**OpenAI Models:**
```json
{
  "label": "GPT-4o-mini",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "maxTokens": 4000
}
```

**Create Custom Configs:**
```bash
# Copy default config
cp parallel-config.json fast-models-config.json

# Edit to use only fast models
# Then use with:
npm run dev parallel-resume <jobId> --config fast-models-config.json
```

## CLI Options

```bash
npm run dev parallel-resume <jobId> [cvFile] [options]
```

### Arguments

- `<jobId>` - Required. Job ID from logs directory
- `[cvFile]` - Optional. Path to CV file (auto-detected if omitted)

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Config file path | `parallel-config.json` |
| `-n, --num-models <n>` | Use first N models from config | All models |
| `--no-critique` | Skip critique workflow (faster) | Critique enabled |
| `--skip-judge` | Skip PDF judge validation | Judge enabled |
| `--output <dir>` | Output directory | `RESUME_OUTPUT_DIR` from .env |

### Examples

```bash
# Quick comparison with 2 fastest models
npm run dev parallel-resume job123 --num-models 2 --no-critique

# Use custom config with premium models
npm run dev parallel-resume job123 --config premium-models.json

# Specify custom CV and output location
npm run dev parallel-resume job123 ~/alt-cv.txt --output ~/Desktop/Resumes
```

## Performance & Cost

### Speed Optimization

**Parallel Execution:**
- Total time = Classifier time + Slowest generator time
- 3 models: ~25s (5s classifier + 20s slowest generator)
- Sequential would be: ~60-90s (5s classifier + 3×20s generators)

**Prompt Caching:**
- First generator: Full cost (~$0.10 for Sonnet)
- Subsequent generators: 90% savings on cached tokens
- Cache TTL: 5 minutes (run multiple comparisons quickly!)

### Cost Breakdown

**Per Generation:**
- Classifier: ~$0.001 (shared)
- Claude Sonnet 4.5: ~$0.11
- Claude Haiku 4.5: ~$0.03
- GPT-4o: ~$0.08
- **Total: ~$0.22**

**With Prompt Caching (second run within 5 min):**
- Classifier: ~$0.001
- Generators: ~$0.03 each (cached)
- **Total: ~$0.10**

### Comparison to Single Resume

| Approach | Time | Cost | Resumes |
|----------|------|------|---------|
| Single (standard) | ~20s | ~$0.11 | 1 |
| Parallel (3 models) | ~25s | ~$0.22 | 3 |
| Sequential (3 models) | ~60s | ~$0.33 | 3 |

**Parallel advantage:** 2.4× faster than sequential, 33% cheaper!

## Use Cases

### 1. Quality Comparison

Compare output quality across models:
- Claude Sonnet: Balanced, high quality
- Claude Haiku: Fast, concise
- GPT-4o: Different perspective, OpenAI style

**Best for:** Evaluating which model produces the best resume for your profile

### 2. Model Selection

Test different models to find your favorite:
```json
{
  "models": [
    {"label": "Sonnet 4.5", "provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "maxTokens": 8000},
    {"label": "Opus 4.5", "provider": "anthropic", "model": "claude-opus-4-5-20251101", "maxTokens": 8000},
    {"label": "GPT-4o", "provider": "openai", "model": "gpt-4o", "maxTokens": 4000}
  ]
}
```

**Best for:** One-time evaluation to choose your default model

### 3. Speed Testing

Compare fast vs quality models:
```json
{
  "models": [
    {"label": "Haiku (Fast)", "provider": "anthropic", "model": "claude-haiku-4-5-20251001", "maxTokens": 8000},
    {"label": "Sonnet (Balanced)", "provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "maxTokens": 8000}
  ]
}
```

**Best for:** Finding the speed/quality sweet spot for your workflow

### 4. Multiple Versions for A/B Testing

Generate different versions with varied settings:
```bash
# Version 1: Leader mode
npm run dev parallel-resume job123 --config leader-models.json

# Version 2: Builder mode
npm run dev parallel-resume job123 --config builder-models.json
```

**Best for:** Creating multiple resume variants for different audiences

## Troubleshooting

### "No job file found"

**Problem:** Job data doesn't exist in logs/

**Solution:**
```bash
# List available jobs
npm run dev list

# Or create a new job
npm run dev create-job <url>
```

### "ANTHROPIC_API_KEY environment variable not set"

**Problem:** Missing API key for classifier or Claude models

**Solution:** Add to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### "Partial failures" (e.g., 2/3 success)

**Problem:** One model failed but others succeeded

**Solution:**
- Check `comparison-metadata.json` for error details
- Common causes: rate limits, API timeout, model availability
- Partial success is acceptable - use successful PDFs
- Retry with `--num-models 2` to exclude failing model

### PDFs not opening automatically

**Problem:** Comparison folder doesn't open (non-macOS)

**Solution:**
```bash
# Manually open the folder (path shown in output)
cd ~/Google\ Drive/.../Comparisons/
open .  # macOS
xdg-open .  # Linux
explorer .  # Windows
```

### Slow generation

**Problem:** Taking longer than expected

**Possible causes:**
- First run (cache miss) - normal
- High API load - retry during off-peak
- Large CV file - consider reducing maxRoles

**Optimization:**
```bash
# Skip critique for faster generation
npm run dev parallel-resume job123 --no-critique

# Use fewer, faster models
npm run dev parallel-resume job123 --num-models 2
```

## Advanced Usage

### Chaining with Other Commands

```bash
# Full workflow: extract → score → parallel resume
npm run dev extract <url>
npm run dev score
npm run dev parallel-resume <jobId>
```

### Batch Processing

```bash
# Generate parallel resumes for multiple jobs
for job in job1 job2 job3; do
  npm run dev parallel-resume $job
done
```

### Custom Scripting

```typescript
import { ParallelResumeOrchestrator } from './agents/parallel-resume-orchestrator';

const orchestrator = new ParallelResumeOrchestrator('./my-config.json');

const result = await orchestrator.generateParallelResumes(
  'job123',
  '/path/to/cv.txt',
  jobData,
  {
    numModels: 2,
    skipCritique: true
  }
);

console.log(`Generated ${result.successCount} resumes for $${result.totalCost}`);
```

## Tips & Best Practices

### 1. Cost Management

- **Use `--num-models 2`** for routine comparisons (save 30%)
- **Run multiple jobs within 5 minutes** to leverage prompt caching
- **Set `LLM_AUTO_CONFIRM=true`** in .env for automation (but monitor costs!)

### 2. Quality Optimization

- **Always include Claude Sonnet** - best quality/cost balance
- **Add GPT-4o for perspective** - different writing style
- **Skip Haiku for critical applications** - faster but lower quality

### 3. Workflow Efficiency

- **Create configs for different scenarios:**
  - `quick-config.json` - 2 fast models
  - `quality-config.json` - 3 premium models
  - `cost-config.json` - budget-conscious selection

- **Use `--no-critique` during testing** - iterate faster

- **Compare PDFs in Preview (macOS)** - open all 3, view side-by-side

### 4. Comparing Results

When reviewing PDFs, look for:
- **Content differences:** What each model emphasized
- **Writing style:** Formal vs conversational tone
- **Bullet quality:** Conciseness and impact
- **Domain adaptation:** How well each model applied domain-specific language
- **Formatting:** Layout and visual consistency

Choose the best resume or mix-and-match content from different models!

## Future Enhancements

Potential improvements (not yet implemented):

- **HTML comparison UI:** Web interface for side-by-side comparison
- **Automatic scoring:** Rate each resume against job requirements
- **Hybrid mode:** Combine best sections from multiple models
- **Google Sheets integration:** Track comparisons over time
- **Custom prompts per model:** Fine-tune prompts for each model's strengths

---

## Summary

**What:** Generate 2-3 resumes in parallel using different LLM models
**Why:** Compare quality, speed, and style across models
**How:** Shared classifier + parallel generators + organized output
**Cost:** ~$0.22 for 3 resumes (~$0.10 with caching)
**Speed:** ~25s for 3 resumes (2.4× faster than sequential)

**Current Models:**
1. Claude Sonnet 4.5 (best quality)
2. Claude Haiku 4.5 (fastest)
3. GPT-4o (alternative perspective)

**Get Started:**
```bash
npm run dev parallel-resume <jobId>
```

---

For questions or issues, see the main [README.md](../README.md) or create a GitHub issue.
