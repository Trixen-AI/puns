# Design system

The visual direction was set by brief: match the reference site the maintainer
chose (layerzero.network) in palette, type and structure, then make it Puns'
through subject matter rather than styling.

Nothing was copied from that site. Its assets, artwork and copy are its own.
What was taken is what is not ownable: measured colour values, a type scale, a
spacing rhythm, and a structural approach. The typefaces are Roboto and Roboto
Mono, both Apache 2.0, so we use the same faces legitimately.

Tokens were extracted by driving the reference in Playwright and reading
computed styles off every rendered element, not estimated by eye. The audit
script is in the scratchpad; the numbers below are its output.

## Palette

```
--color-paper        #fcfcfc   page ground
--color-paper-soft   #f5f5f5   footer, quiet controls
--color-paper-block  #f0f0f0   full-bleed section fills

--color-ink          #171717   body text
--color-ink-deep     #0a0a0a   headings, solid buttons
--color-ink-muted    #5c5c5c   secondary prose
--color-ink-soft     #797979   tertiary, list items
--color-ink-faint    #a3a3a3   mono metadata
--color-ink-ghost    #bdbdbd   the quiet half of a two-clause headline

--color-signal       #337c18   the only colour on the page
--color-rule         rgba(0,0,0,0.09)
```

`--color-signal` is reserved for state that is genuinely live: a curve still
trading, a graduation reached. It is never used to decorate.

## Type

Two families. Roboto for everything a person reads, Roboto Mono for
machine-adjacent detail: addresses, indices, counters, prices.

The defining choice is weight. Display sizes run at **400, not 700**, with
tight negative tracking. Scale carries the emphasis and weight stays quiet;
setting these headlines bold would collapse the whole register.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| display-1 | clamp 36 to 68px | 400 | -0.048em |
| display-2 | clamp 30 to 48px | 400 | -0.042em |
| display-3 | clamp 20 to 28px | 400 | -0.025em |
| body | 14px / 1.75 | 400 | normal |
| lede | 16px / 1.6 | 400 | normal |
| meta (mono) | 11px | 400 | 0.02em |

Line length is capped at 62ch for prose and 46ch for the lede.

## Structure

**Rows, not cards.** The primary container is a list row separated from its
neighbours by a single hairline. No border boxes, no shadows, no fills. This is
the one rule that keeps the page from collapsing into the generic card grid.

**Sticky left, scrolling right.** Long sections put their heading in a sticky
left column while the content scrolls past on the right.

**Numbered markers only for sequences.** The launch lifecycle is numbered
because each step genuinely can only follow the one above it. Nothing else is.

**Square controls.** Buttons use a 2px radius, matching the reference. Radii
are deliberately inconsistent by role: 2px on controls, 7px on inline chrome,
12px on containers. One radius everywhere is a tell.

## Motion

Framer Motion (`motion/react`) throughout, and every instance answers a
question rather than announcing itself:

- **The curve draws once** on load. It is the page's thesis, so it is the page's
  one performed moment.
- **Reveals are 12px and a fade**, once per element. Larger travel turns reading
  into waiting; replaying turns a page into a slideshow.
- **The line-art band is scroll-linked**, not time-linked, so it responds to the
  reader instead of performing at them. Scroll drives scale and opacity only;
  nothing changes position and fights the text.

`useReducedMotion` is honoured in every component, and the CSS layer disables
animation under `prefers-reduced-motion` as a second line of defence.

## Generative figures

Two, both authored in code and both meaning something.

**`BondingCurve`** plots the real formula. The curve holds the whole supply
against a virtual 1.68 ETH reserve, so `price(s) = k / (supply - s)^2`. It is
drawn against tokens sold rather than ETH raised because that is the axis where
the shape is legible: flat for the first half, then steep. Hairlines drop from
the curve to the baseline and crowd where price climbs fastest, so the shape of
the risk is visible before a number is read.

> Implementation note: those hairlines are vertical `<line>` elements, which
> have a zero-width bounding box. An `objectBoundingBox` gradient degenerates on
> them and renders nothing. The gradient must use `gradientUnits="userSpaceOnUse"`.

**`LineField`** fans quadratic beziers from a single focal point. It reads as
ornament and states the premise: every launch begins from an identical point,
and only where it travels afterwards separates one from another.

## Application shell

The app at `/app` shares this system and nothing else. It carries its own
header with its own navigation. None of the marketing links appear there:
someone who has opened the app is trying to do something, and offering them
"How it works" mid-task asks whether they are in the right place.

## House style

No em dashes anywhere in the codebase or the interface copy.
