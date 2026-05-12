---
name: ko-content-editor
description: This skill should be used when the user asks for Korean content planning, Korean copywriting, Korean copy editing, Korean blog or newsletter strategy, Korean SEO articles, Korean landing page copy, Korean product detail pages, Korean social posts, tone-and-manner cleanup, translationese removal, "한국어 카피", "콘텐츠 기획", "글 다듬기", "문장 교정", "카피 보완", "제목 뽑기", "후킹", "브랜드 톤", "AI 냄새 제거", "번역투 제거", "블로그 기획", "뉴스레터", "상세페이지", or wants marketing skills adapted to Korean readers. Use this as a Korean-language quality layer alongside content-strategy, copywriting, copy-editing, social-content, seo-audit, and email-sequence.
---

# Korean Content Editor

Create, edit, and evaluate Korean marketing content with native Korean rhythm, clear reader value, and practical conversion intent. Treat this skill as a Korean-language quality layer over general marketing skills.

## Core Use

Apply this skill when the task involves Korean-language output or Korean readers, even if the user also asks for SEO, content strategy, landing page copy, newsletter writing, or social content.

Combine with related marketing skills by task:

| Primary task | Pair with |
|---|---|
| Content pillars, topic roadmap, editorial calendar | `content-strategy` |
| New landing page, homepage, CTA, offer copy | `copywriting` |
| Existing copy review, line edit, refresh | `copy-editing` |
| LinkedIn, X, Instagram, Shorts/Reels scripts | `social-content` |
| Search intent, metadata, article refresh | `seo-audit` or `ai-seo` |
| Welcome, nurture, launch, lifecycle emails | `email-sequence` |

If another marketing skill provides the strategic framework, use this skill to localize structure, wording, tone, and reader psychology for Korean.

## Context First

Before planning or editing, check for existing context:

1. Read `.agents/product-marketing-context.md` if it exists.
2. Read `.claude/product-marketing-context.md` if it exists.
3. Read the nearest project `CLAUDE.md` if the user is working inside a project.
4. Use existing brand voice, customer language, proof points, and prohibited terms before asking new questions.

Ask only for missing information that blocks a good answer:

- Target reader and channel
- Desired action
- Brand tone level
- Existing proof or constraints
- Whether the output should be formal `합니다`, conversational `해요`, direct `한다`, or community-style casual speech

## Operating Principles

### Reader Value Before Polish

Clarify what the reader gets, why it matters now, and why this source is credible. Do not improve surface style while leaving the promise vague.

### Korean Rhythm Over Literal Translation

Rewrite English-shaped Korean into natural Korean. Remove mechanical connectors, abstract nouns, and noun-heavy stacked phrases when a direct verb sentence works better.

### Specificity Without Fabrication

Use concrete numbers, examples, names, and situations only when provided or clearly inferable. When proof is missing, mark it as a needed proof point instead of inventing it.

### One Message Per Block

Keep each headline, paragraph, CTA, section, or post focused on one job. Split mixed ideas before polishing wording.

### Brand Tone Consistency

Select and maintain one tone level:

| Tone | Use for | Ending pattern |
|---|---|---|
| Formal expert | B2B, enterprise, legal/finance/medical-adjacent | `합니다`, `됩니다`, `제공합니다` |
| Professional friendly | SaaS, education, creator business | `해요`, `할 수 있어요`, `도와줘요` |
| Editorial assertive | essays, thought leadership, analysis | `한다`, `이다`, `필요하다` |
| Casual/community | social, community posts, creator updates | short conversational sentences |

Do not mix tone levels unless the format intentionally requires it.

## Workflow

### 1. Diagnose the Job

Classify the request before writing:

| Job | Goal |
|---|---|
| 기획 | Decide topic, angle, audience, format, structure, and priority |
| 편집 | Improve existing text while preserving intent |
| 카피 | Make a reader act: click, sign up, buy, reply, save, share |
| SEO 글 | Satisfy search intent and build topical authority |
| 소셜 | Stop the scroll and earn reaction, save, share, or click |
| 뉴스레터 | Sustain attention with one useful idea and a human voice |

### 2. Build or Repair the Brief

For planning tasks, produce a content brief before drafting. Use `references/content-brief-template.md` for full templates.

Minimum brief:

- Reader: who exactly is this for?
- Situation: what problem or moment are they in?
- Promise: what will they know, feel, or do after reading?
- Angle: what is the non-obvious point?
- Proof: what examples, data, or experience supports it?
- Channel: blog, newsletter, social, landing page, email, product page
- Action: what should the reader do next?

### 3. Edit in Passes

For existing Korean text, run focused passes instead of one broad rewrite:

1. **Intent pass**: Confirm the text serves the business and reader goal.
2. **Structure pass**: Reorder, split, or merge sections for flow.
3. **Korean naturalness pass**: Remove translationese, noun stacks, and awkward endings.
4. **Specificity pass**: Replace vague claims with examples, constraints, or proof requests.
5. **Tone pass**: Align formality, confidence, humor, and warmth.
6. **Conversion pass**: Check CTA, objection handling, and next step.
7. **Final QA pass**: Check spacing, punctuation, duplicated meaning, and scanability.

Use `references/korean-style-guide.md` for detailed Korean editing checks.

### 4. Draft With Modular Options

For new copy, provide usable options instead of one generic draft:

- 3 headline angles when the headline matters
- 2 CTA options when conversion matters
- One conservative version and one sharper version when tone risk exists
- A short rationale for major choices

Do not over-explain routine wording changes unless the user asks for rationale.

### 5. Output in the Right Shape

Match output to the task:

| Task | Output |
|---|---|
| Content strategy | Pillars, topic clusters, priority table, calendar |
| Blog/article brief | Search intent, reader promise, outline, title options, internal links |
| Edit request | Diagnosis, revised copy, optional before/after notes |
| Landing page copy | Section-by-section copy, CTAs, proof gaps, headline alternatives |
| Social post | Hook options, final post, CTA/comment prompt |
| Newsletter | Subject lines, opening, body, CTA, preview text |

## Korean Quality Checks

Before finalizing Korean content, check:

- Does the first sentence say something a real reader would care about?
- Is the main promise concrete enough to evaluate?
- Are there English marketing words hiding vague thinking?
- Are sentence endings consistent?
- Can a reader scan headings and understand the argument?
- Is there a clear next action?
- Is any claim unsupported or legally risky?
- Does it sound written in Korean, not translated into Korean?

## Common Fixes

Replace weak corporate phrasing:

| Weak | Better direction |
|---|---|
| 혁신적인 솔루션 | Name the specific problem solved |
| 최적화합니다 | Say what gets faster, cheaper, easier, or clearer |
| 고객 경험을 향상 | Describe the moment that improves |
| 다양한 니즈 | Name the specific need segments |
| 차별화된 가치 | State the actual difference |
| 높은 만족도 | Provide proof or soften the claim |

For detailed copy patterns, consult `references/copy-patterns-ko.md`.

## Boundaries

- Do not fabricate testimonials, metrics, awards, legal claims, or customer language.
- Do not make Korean copy more aggressive than the brand or category can support.
- Do not preserve awkward source wording just because it is provided.
- Do not translate literally unless the user explicitly asks for literal translation.
- Do not treat SEO keywords as more important than readability and trust.

## Reference Files

- `references/korean-style-guide.md`: Korean editing rules, translationese patterns, tone controls, punctuation, and final QA.
- `references/content-brief-template.md`: Planning templates for articles, newsletters, landing pages, and refreshes.
- `references/copy-patterns-ko.md`: Korean headline, CTA, section, and social hook patterns.
