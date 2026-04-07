# Klinex Design

## Purpose

This document is the brand anchor for `klinex`.

It exists to make the product feel intentional across the terminal UI, docs, logo exploration, and future marketing surfaces.

It does not assume AI image generation will produce final-ready identity assets. AI is only used here for visual concept discovery.

## Brand Thesis

`klinex` is lucent control for localhost.

It is a premium terminal-native tool for discovering, understanding, opening, and stopping local developer services. The product should feel precise and calm, not noisy or gimmicky.

## Product Character

- Lucent
- Warm
- Precise
- Premium
- Technical
- Calm under load
- Terminal-native

## Positioning

`klinex` is not a generic process viewer.

`klinex` is not a cold enterprise infra panel.

`klinex` is not a chaotic hacker toy.

`klinex` is a luminous command surface for local services.

## Visual Direction

The current product already points at the right direction:

- warm orange glow instead of blue neon
- sakura or branching organic motion instead of rigid grid-only geometry
- dark, quiet canvas with bright moments of emphasis
- terminal sharpness with a cinematic surface treatment

The visual identity should combine two ideas:

1. Organic branching
2. Network precision

That means the brand mark should feel like a sakura-tree silhouette or bloom structure that also reads as a local network, service map, or node graph.

## Theme: Lucent ONTG

`lucent ontg` should be interpreted as a warm, luminous, orange-led system with a grounded dark substrate.

Working definition:

- `lucent`: glowing, crisp, premium, visible in low-light terminal contexts
- `ontg`: orange-led terminal geometry with network-grade precision

The theme should avoid generic cyberpunk styling. It should feel warmer, cleaner, and more restrained.

## Color Palette

Primary colors should stay aligned with the current app palette.

- Ember Orange: `#EC5B2B`
- Warm Orange: `#EE7948`
- Amber: `#E5C07B`
- Warm White: `#FFF7F1`

Supporting darks:

- Smoke Surface: `#2A1A15`
- Deep Float: `#3A2218`
- Charcoal Border: `#3C3C3C`
- Muted Gray: `#808080`

Usage guidance:

- Use ember orange for primary focus and selected states.
- Use warm orange and amber for gradients, glow steps, and organic highlights.
- Use warm white sparingly for edge light and premium contrast moments.
- Keep the background dark and quiet so the orange system feels deliberate.

## Shape Language

- Tapered branches
- Node tips
- Petal fragments
- Soft asymmetry
- Clean silhouettes
- Sparse negative space

The system should look elegant first and technical second.

Avoid:

- heavy chrome effects
- mascots
- hard sci-fi blue neon
- over-detailed botanical illustration
- generic shield, hexagon, or esports logo shapes

## Logo Direction

Primary concept: `sakura network`

The logo should depict a minimal sakura-inspired structure fused with a local network graph.

Desired properties:

- readable at small sizes
- recognizable in one color
- strong silhouette before detail
- usable as terminal icon, social avatar, and app mark
- no dependency on text to work

Recommended construction cues:

- a trunk or stem that subtly anchors the form
- branching arms that terminate in node-like tips
- limited petal geometry, not a full flower illustration
- possible implicit `K` shape, but only if it emerges naturally

The logo should suggest:

- local services branching across a machine
- discoverability and flow
- warmth rather than aggression

## Wordmark Guidance

Do not depend on AI generation for the final wordmark.

If a wordmark is designed later, it should be:

- clean
- modern
- slightly sharp
- confident without looking militaristic
- compatible with terminal culture

The symbol is the priority. The wordmark can be resolved later with human judgment.

## Motion Guidance

The existing sakura animation is a strong brand cue.

Motion should feel:

- slow
- breathable
- ambient
- lightly alive

Avoid frantic scanning-line or glitch-heavy behavior.

Good motion references for `klinex`:

- shimmer
- drift
- bloom
- sway
- quiet pulsing emphasis

## Voice And Messaging

The current product language is accurate but generic. The brand voice should stay concise and technical while becoming more ownable.

Voice traits:

- direct
- confident
- calm
- understated
- observant

Good lines:

- `Lucent control for localhost.`
- `A luminous OpenTUI for local services.`
- `Discover, open, and stop local services from one terminal.`
- `See your local stack with more signal and less noise.`

Avoid copy that sounds:

- theatrical
- pseudo-rebellious
- overloaded with buzzwords
- excessively security-themed

## AI Image Generation Policy

AI image generation is unreliable for identity consistency.

Because of that, Midjourney should be used only for concept exploration, not as the final source of truth for a complete logo system.

Rules:

- Generate only the core symbol direction.
- Do not expect separate AI generations to produce a consistent logo, wordmark, and splash system.
- Pick one strong concept and derive brand rules from it manually.
- Use this document, not the generator, as the consistency anchor.

## Midjourney Prompt

Use one primary prompt for concept discovery:

```text
/imagine prompt: premium vector logo for "klinex", luminous warm orange sakura tree fused with a local network graph, elegant branching structure with subtle node terminals, minimal geometric petals, dark charcoal background, refined developer tooling brand, terminal-native aesthetic, cinematic glow, precise negative space, clean silhouette, flat vector mark, icon-ready, no text, no mockup, no 3d, no mascot, no clutter --stylize 225 --v 7
```

## Derived Assets

The first logo-safe reduction derived from the generated concept lives in:

- `assets/logo-mark.svg`: transparent standalone mark
- `assets/logo-mark-badge.svg`: dark app-icon badge
- `assets/social-card.svg`: release and social share artwork
- `assets/wordmark-lockup.svg`: symbol plus wordmark lockup

These files are intentionally simplified. They are not a literal trace of the generated PNG.

Reduction choices made for logo safety:

- removed atmospheric particles
- reduced blossom count
- thickened the core branch structure
- strengthened the trunk silhouette
- kept the sakura-plus-network idea while reducing painterly detail

## GitHub Social Preview Strategy

GitHub repository social previews are not controlled by a checked-in metadata file in this repo. They are set in the repository settings UI.

Recommended workflow:

1. Treat `assets/social-card.svg` as the editable master.
2. Export a PNG from it before a release or major repo refresh.
3. Upload that PNG in GitHub repository settings under social preview.
4. Reuse the same card, or a close variant, as the lead image in release notes and announcement posts.

Practical rules:

- Keep the aspect ratio at `1200x630`.
- Use the `KLINEX` wordmark, one short tagline, and one concise supporting line.
- Keep the left-side mark large enough to survive Twitter, Slack, and GitHub previews.
- Do not overload the card with install commands or dense feature lists.

Suggested metadata hierarchy for release visuals:

- primary title: `KLINEX`
- subtitle: `Lucent control for localhost.`
- supporting line: `Discover, open, and stop local services from one terminal.`

If the social card changes significantly, update this document so the wording and visual treatment stay aligned.

## Reference-Based Prompt

If a second Midjourney pass is needed, use the current generated image as a visual reference and bias harder toward logo reduction.

Prompt template:

```text
/imagine [reference-image] premium reduced vector logo for "klinex", preserve the asymmetric sakura network tree composition, fewer blossoms, stronger trunk silhouette, cleaner outer contour, thicker node connections, minimal petals, high-end developer tooling brand, warm lucent orange palette, dark charcoal background, flat graphic mark, logo-safe, scalable icon, no floating particles, no painterly texture, no extra decoration, no text, no mockup, no 3d --iw 2 --stylize 120 --v 7
```

## Prompt Intent

This prompt is trying to discover a symbol with:

- a memorable silhouette
- warm lucent color behavior
- organic plus technical balance
- enough restraint to become a real brand mark later

The goal is not to ship the raw image unchanged.

## Evaluation Criteria

If multiple generations are produced, prefer the image that has:

- the strongest silhouette at thumbnail size
- the least visual clutter
- the clearest blend of sakura and network ideas
- the most premium tone
- the least dependency on lighting tricks

Reject images that:

- look like fantasy art
- look like a game clan emblem
- read as a flower illustration instead of a mark
- use too many detached glowing particles
- become unreadable in one color

## Near-Term Use

This brand direction should inform:

- `README.md` copy refresh
- package description refresh
- terminal title treatment and empty-state language
- future logo iteration
- any landing page or release art later

## Summary

`klinex` should feel like lucid infrastructure rendered through a warm terminal lens.

The brand is defined by a dark substrate, a lucent orange palette, sakura-network symbolism, and calm precision.

Use AI to explore the mark. Use human judgment and this document to make it coherent.
