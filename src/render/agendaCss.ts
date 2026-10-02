import { DEFAULT_COLORS, DEFAULT_LOGO_HEIGHT, type BrandColors } from '../model/brandDefaults.ts'
import type { Schedule } from '../model/schema.ts'
import { cssColor, cssFontFamily } from './escape.ts'
import { withGenericFallback } from './fonts.ts'
import { DARK_LIFT, resolveDarkColors, resolveLightColors } from './theme.ts'

/** The colour custom properties for one palette. */
function paletteVars(colors: BrandColors, lift: number): string {
  const c = (key: keyof BrandColors) => cssColor(colors[key], DEFAULT_COLORS[key])
  return `--bg:${c('background')};--card:${c('surface')};--fg:${c('text')};--muted:${c('muted')};--line:${c('line')};--primary:${c('primary')};--accent:${c('accent')};--note:${c('note')};--lift:${Math.round(lift * 100)}%;`
}

/** Motion rules (CSS only). Empty when motion is off, so nothing animation-related is emitted. */
function motionCss(schedule: Schedule): string {
  const { preset, logoAnimation } = schedule.branding.motion
  const rules: string[] = []
  const keyframes: string[] = []
  if (preset !== 'none') {
    keyframes.push('@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}')
    rules.push('.head,.parallel-note,.sec>h2,.legend,.people,.btn{animation:rise .6s ease both}')
  }
  if (preset === 'stagger') {
    rules.push('.ev{animation:rise .5s ease both;animation-delay:calc(var(--i,0) * 40ms)}')
  }
  if (logoAnimation) {
    keyframes.push('@keyframes logo-in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}')
    rules.push('.logo{animation:logo-in .7s ease both}')
  }
  if (rules.length === 0) return ''
  const selectors = ['.head', '.parallel-note', '.sec>h2', '.legend', '.people', '.btn', '.ev', '.logo'].join(',')
  return `
@media (prefers-reduced-motion:no-preference){
${keyframes.join('\n')}
${rules.join('\n')}
}
@media print{${selectors}{animation:none!important}}`
}

/**
 * Stylesheet for the rendered agenda, ported from the reference layout. Colours and fonts
 * arrive as CSS custom properties set from `branding`; per-track colours are set on each
 * element as `--c`. Dark variables follow the reference pattern: under
 * `prefers-color-scheme:dark` (unless `data-theme="light"`) and under `data-theme="dark"`.
 * Layout uses logical properties so right-to-left pages mirror correctly.
 */
export function agendaCss(schedule: Schedule): string {
  const { branding } = schedule
  const { fonts } = branding
  const lanes = Math.max(schedule.columns.length, 1)
  const template = `56px repeat(${lanes},1fr)`
  const mobileTemplate = `44px repeat(${lanes},1fr)`
  const light = paletteVars(resolveLightColors(branding.colors), 0)
  const dark = paletteVars(resolveDarkColors(branding), DARK_LIFT)
  const logoSize =
    branding.logoHeight === undefined
      ? `max-height:${DEFAULT_LOGO_HEIGHT}px`
      : `height:${Math.min(120, Math.max(16, Math.round(branding.logoHeight)))}px`

  return `
:root{
  color-scheme:light;
  ${light}
  --soft:color-mix(in srgb,var(--primary) 4%,color-mix(in srgb,var(--muted) 5%,var(--card)));
  --display:${withGenericFallback(cssFontFamily(fonts.display, 'sans-serif'), 'sans-serif')};
  --body:${withGenericFallback(cssFontFamily(fonts.body, 'sans-serif'), 'sans-serif')};
  --mono:${withGenericFallback(cssFontFamily(fonts.mono, 'monospace'), 'monospace')};
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${dark}}}
:root[data-theme="dark"]{color-scheme:dark;${dark}}
body{margin:0;font-size:14px;background:var(--bg);color:var(--fg);font-family:var(--body);line-height:1.45;padding-inline:16px;padding-block:24px 56px}
img{max-width:100%}
.wrap{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
.sec{display:flex;flex-direction:column;gap:16px}
.logo{display:block;align-self:flex-start;${logoSize};width:auto}
.eyebrow{font-family:var(--display);font-weight:500;font-size:14px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}
h1{font-family:var(--display);font-weight:500;font-size:clamp(32px,8vw,52px);line-height:1.1;letter-spacing:-.02em;margin:0;text-wrap:balance}
h1 b{color:var(--primary);font-weight:500}
h2{font-family:var(--display);font-weight:500;font-size:22px;margin:0}
.head{display:flex;flex-direction:column;gap:12px}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;color:var(--muted);font-size:15px}
.meta span{display:inline-flex;gap:8px;align-items:center}
.time{font-variant-numeric:tabular-nums}
.rng{font-family:var(--mono)}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:14px;color:var(--muted)}
.chip,.ev,.lane-head div{--c:var(--muted);--t:color-mix(in srgb,var(--c),#fff var(--lift))}
.chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--display);font-weight:500;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--t) 12%,var(--card));color:var(--t)}
.chip.all{background:var(--soft)}
.chip::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.parallel-note{background:color-mix(in srgb,var(--note) 12%,var(--card));border-radius:16px;padding:12px 16px;font-size:14px;display:flex;gap:12px;align-items:flex-start}
.parallel-note::before{content:"";flex:none;width:4px;align-self:stretch;border-radius:2px;background:var(--note)}
.parallel-note div{white-space:pre-line}

.agenda,.lane-head{display:grid;grid-template-columns:${template}}
.agenda{gap:12px 10px;align-items:stretch}
.t{font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums;padding-top:12px;color:var(--muted);line-height:1.3;text-align:start}
.t b{display:block;color:var(--fg);font-weight:500;font-size:14px}
.ev{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;min-width:0;display:flex;flex-direction:column;gap:8px}
.ev h3{font-family:var(--display);font-weight:500;font-size:16px;line-height:1.3;margin:0;text-wrap:balance}
.ev .spk{font-family:var(--display);font-weight:500;font-size:14px;color:var(--fg)}
.ev .spk .lbl{font-weight:400;color:var(--muted)}
.ev .when{font-family:var(--mono);font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.ev.track{border-color:var(--t);border-inline-start-width:4px}
.ev.shared{background:var(--soft);border-style:dashed}
.ev.key{border-color:var(--accent);border-style:solid;border-inline-start-width:4px}
.ev .badge{display:none;align-self:flex-start;background:var(--note);color:#1f1f1f;font-family:var(--display);font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
.ev.now{box-shadow:0 0 0 2px var(--note)}
.ev.now .badge{display:inline-block}
.ev.ghost{background:transparent;border-color:var(--t);border-style:dashed;border-inline-start-width:4px;color:var(--muted);font-size:14px;justify-content:center}
.lane-head{gap:10px}
.lane-head div{font-family:var(--display);font-weight:500;font-size:13px;letter-spacing:.04em;text-transform:uppercase;padding:6px 0;border-bottom:3px solid var(--t);color:var(--t)}
.small{font-size:13px;color:var(--muted);margin:-4px 0 0;white-space:pre-line;text-align:start}

.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.person{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;gap:12px;align-items:center;min-width:0}
.av{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-weight:500;color:#fff;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover}
.person b{font-family:var(--display);font-weight:500;display:block}
.person span{font-size:13px;color:var(--muted)}
.btn{display:inline-flex;align-self:flex-start;background:var(--primary);color:var(--bg);font-family:var(--display);font-weight:500;padding:10px 20px;border-radius:999px;text-decoration:none}
.btn:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
:root[dir="rtl"] .eyebrow,:root[dir="rtl"] .chip,:root[dir="rtl"] .lane-head div,:root[dir="rtl"] .badge{letter-spacing:0;text-transform:none}
:root[dir="rtl"] h1{letter-spacing:0}

@media (max-width:520px){
  .agenda,.lane-head{grid-template-columns:${mobileTemplate}}
  .agenda{column-gap:8px}
  .lane-head{gap:8px}
  .ev{padding:10px 10px}
  .ev h3{font-size:14px}
}${motionCss(schedule)}

@page{size:A4;margin:12mm}
@media print{
  :root,:root[data-theme="dark"],:root:not([data-theme="light"]){color-scheme:light;${light}}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{padding:0}
  .wrap{max-width:none}
  .ev,.person,.t,.lane-head,.small{break-inside:avoid}
  .ev .badge{display:none!important}
  .ev.now{box-shadow:none}
  .btn::after{content:"(" attr(href) ")";margin-inline-start:.4em;font-weight:400;overflow-wrap:anywhere}
}
`.trim()
}
