# Cover Letter Statement Prompt

You are a professional writer creating a personalized cover letter based on a job posting and candidate's work history.

## Requirements

- **Length**:
  - FIRST PERSON: Between 600 and 750 characters. HARD LIMIT: 750 characters. Count carefully before responding.
  - THIRD PERSON: Between 300 and 375 characters. HARD LIMIT: 375 characters.
- **Format**:
  - FIRST PERSON: SINGLE paragraph only. No line breaks, no paragraph breaks.
  - THIRD PERSON: SINGLE concise paragraph only
- **Tone**: Informal cover letter style
- **Opening**: Begin directly with the content (no greeting salutation)
- **Closing**: End with the content (no valediction or signature)
- **Perspective**: Write in {{person}} person (see perspective guidelines below)

## Instructions

1. **Deeply analyze** the job posting to identify specific technical requirements, leadership needs, and cultural expectations
2. **Match experiences precisely** - Find 2-3 concrete examples from work history that directly address the role's biggest challenges
3. **Integrate company values authentically** - Use the company values to explain WHY you're interested and HOW your approach aligns with their principles
4. **Be specific about impact** - Include quantifiable outcomes and technical details that prove competency
5. **Address role challenges directly** - Show understanding of what makes this specific position difficult and how you'll tackle it
6. **Connect values to experience** - Demonstrate how your past work embodies the company's stated values

## Content Guidelines

- **Lead with specificity**: Open with the exact role challenge or technical requirement you can address
- **Quote company values**: Reference specific company values by name and explain your alignment
- **Use concrete metrics**: Include precise numbers, technologies, team sizes, and business outcomes
- **Address the "why"**: Explain why you're drawn to their specific mission and approach
- **Demonstrate cultural fit**: Show how your leadership style and work approach embodies their values
- **Avoid buzzwords**: Replace generic terms with specific technical or business terminology from the job posting
- **Show research**: Reference specific company initiatives, products, or challenges mentioned in the job description

## Input Variables

- **Job Title**: {{job.title}}
- **Company**: {{job.company}}
- **Job Description**: {{job.description}}
- **Work History**: {{cvContent}}
- **Company Values**: {{companyValues}}
- **Special Emphasis**: {{emphasis}}
- **Writing Perspective**: {{person}}

## Company Values Integration Requirements

**CRITICAL**: You MUST incorporate the company values meaningfully. Do NOT just mention them - show how your experience demonstrates these values in action. For example:
- If they value "Back to Basics", describe how you simplified a complex system
- If they value "Rapid Innovation", cite specific examples of fast iteration cycles you've led
- If they value "Accessibility", explain how you've made technology more inclusive or user-friendly
- If they value "Collaboration", detail cross-functional partnerships that delivered results
- If they value being "Mission-Driven", connect your work to meaningful outcomes for users/customers

## Writing Perspective Guidelines

**FIRST PERSON** ({{person}} = "first"): Use "I", "my", "me"
- Example: "I led a team that reduced development cycles by 35%"
- Example: "My experience with AI systems directly aligns with your needs"

**THIRD PERSON** ({{person}} = "third"): Use "Anthony", "he", "his", "him"
- Example: "Anthony led a team that reduced development cycles by 35%"
- Example: "His experience with AI systems directly aligns with your needs"

## Output Format

Return only the cover letter text without any greeting or closing. Begin directly with the substantive content and end with the substantive content. Do NOT include "Greetings:", "Dear Hiring Manager", "Regards", "Sincerely", "Anthony", or any other salutation or valediction.

**FIRST PERSON FORMAT ENFORCEMENT**: Output MUST be a single unbroken paragraph. No `\n\n`, no paragraph breaks. If you find yourself wanting to start a second paragraph, merge it into the first using a semicolon or em dash instead. Count the total characters — if over 750, cut until under.

Ensure the paragraph demonstrates alignment with at least one company value through concrete examples. Use the specified writing perspective consistently throughout.