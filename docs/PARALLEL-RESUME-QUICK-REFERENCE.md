# Parallel Resume Generation - Quick Reference

## TL;DR

Generate 3 resumes in parallel (~25s, ~$0.22):
```bash
npm run dev parallel-resume <jobId>
```

## Configured Models

| Model | Provider | Speed | Cost | Best For |
|-------|----------|-------|------|----------|
| **Claude Sonnet 4.5** | Anthropic | Medium | ~$0.11 | Best overall quality |
| **Claude Haiku 4.5** | Anthropic | Fast | ~$0.03 | Speed & cost |
| **GPT-4o** | OpenAI | Medium | ~$0.08 | Alternative style |

**Classifier:** Claude Haiku 4.5 (~$0.001, ~3-5s, shared across all)

## Common Commands

```bash
# All 3 models (default)
npm run dev parallel-resume job123

# Only 2 models (faster, cheaper)
npm run dev parallel-resume job123 --num-models 2

# Fast mode (no critique)
npm run dev parallel-resume job123 --no-critique

# Custom CV
npm run dev parallel-resume job123 ~/my-cv.txt

# Custom config
npm run dev parallel-resume job123 --config fast-models.json
```

## Output Location

```
~/Google Drive/.../Resumes/Comparisons/
└── {JobId}-{Company}-{Date}/
    ├── comparison-metadata.json
    ├── [Claude Sonnet 4.5] Resume.pdf
    ├── [Claude Haiku 4.5] Resume.pdf
    └── [GPT-4o] Resume.pdf
```

## Cost & Speed

| Scenario | Time | Cost | Note |
|----------|------|------|------|
| 3 models (cold) | ~25s | ~$0.22 | First run |
| 3 models (cached) | ~23s | ~$0.10 | Within 5 min |
| 2 models | ~20s | ~$0.15 | Faster option |
| Sequential (3) | ~60s | ~$0.33 | Don't do this! |

## Configuration

Edit `parallel-config.json`:

```json
{
  "models": [
    {"label": "Model Name", "provider": "anthropic|openai", "model": "model-id", "maxTokens": 8000}
  ],
  "sharedSettings": {
    "maxRoles": 4,
    "temperature": 0.3,
    "mode": "leader",              // or "builder"
    "experienceFormat": "standard" // or "split"
  }
}
```

## Prerequisites

In `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...  # Required
OPENAI_API_KEY=sk-...         # Only if using GPT models
RESUME_OUTPUT_DIR=~/path      # Optional
LLM_AUTO_CONFIRM=true         # Optional (skip cost prompt)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No job found | Run `npm run dev list` or `npm run dev create-job <url>` |
| Missing API key | Add to `.env` |
| 2/3 success | Check `comparison-metadata.json` - partial success is OK |
| Too expensive | Use `--num-models 2` or `--no-critique` |
| Too slow | Use `--no-critique` and run during off-peak hours |

## Tips

✅ **DO:**
- Run multiple jobs within 5 min for cache benefits
- Use 2 models for routine comparisons
- Always include Sonnet for quality
- Review all PDFs side-by-side

❌ **DON'T:**
- Run 10+ models (slow, expensive, diminishing returns)
- Compare on cost alone (quality matters!)
- Skip comparing PDFs (the whole point!)

---

**Full Documentation:** [PARALLEL-RESUME-GENERATION.md](./PARALLEL-RESUME-GENERATION.md)
