# HackVerse Design System

HackVerse is a realtime hackathon operations interface. The design should help a participant or organizer answer one question quickly: which team is moving, and by how much?

## Genre

Atmospheric modern-minimal. The dark canvas stays, but the information hierarchy is quiet, dense, and operational.

## Macrostructure Family

- App pages: Workbench. Data comparison is the first viewport; supporting activity and collaboration tools follow.
- 3D page: Plaza remains an optional spatial view and keeps its existing interaction model.
- Entry pages: Form-led onboarding with the same chrome and action language.

## Theme

- Paper: `--color-void` and `--color-panel`
- Ink: `--color-ink` and `--color-muted`
- Primary signal: `--color-accent` cyan
- Secondary signal: `--color-accent-2` magenta
- Attention signal: `--color-sun` amber
- Rules: `--color-rule`

## Typography

- Display: system sans, bold, upright
- Body: system sans, regular
- Data: system mono for scores, commits, and repository names

## Spacing

Use the 4-point scale in `tokens.css`. Existing Tailwind spacing remains compatible with the system.

## Motion

Motion is restrained: activity updates may flash once, bars transition through width, and focus rings appear immediately. Reduced motion disables spatial movement and preserves opacity-only feedback.

## Microinteractions

Buttons use clear hover, active, disabled, loading, and focus-visible states. Demo actions remain optimistic and use the existing realtime refresh path.

## Shared Rules

- Keep the HackVerse wordmark and dark visual language.
- Prefer comparisons, labels, and real metrics over decorative cards.
- Keep existing routes, APIs, webhook behavior, invite flow, and Supabase contracts unchanged.
- The primary dashboard must surface team commit counts and score differences before secondary tools.
