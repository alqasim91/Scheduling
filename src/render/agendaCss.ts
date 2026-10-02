import type { Schedule } from '../model/schema.ts'
import { cssColor, cssFontFamily } from './escape.ts'

/**
 * Stylesheet for the rendered agenda, ported from the reference layout. Colours and fonts
 * arrive as CSS custom properties set from `branding`; per-track colours are set on each
 * element as `--c` by the markup. Light theme only for now.
 */
export function agendaCss(schedule: Schedule): string {
  const { colors, fonts } = schedule.branding
  const lanes = Math.max(schedule.columns.length, 1)
  const template = `56px repeat(${lanes},1fr)`
  const mobileTemplate = `44px repeat(${lanes},1fr)`

  return `
:root{
  color-scheme:light;
  --bg:${cssColor(colors.background, '#f8fafd')};
  --card:${cssColor(colors.surface, '#ffffff')};
  --fg:${cssColor(colors.text, '#1f1f1f')};
  --muted:${cssColor(colors.muted, '#444746')};
  --line:${cssColor(colors.line, '#c4c7c5')};
  --primary:${cssColor(colors.primary, '#0b57d0')};
  --accent:${cssColor(colors.accent, '#d93025')};
  --note:${cssColor(colors.note ?? '', '#f9ab00')};
  --soft:color-mix(in srgb,var(--primary) 4%,color-mix(in srgb,var(--muted) 5%,var(--card)));
  --display:${cssFontFamily(fonts.display, 'sans-serif')};
  --body:${cssFontFamily(fonts.body, 'sans-serif')};
  --mono:${cssFontFamily(fonts.mono, 'monospace')};
}
body{margin:0;font-size:14px;background:var(--bg);color:var(--fg);font-family:var(--body);line-height:1.45;padding-inline:16px;padding-block:24px 56px}
img{max-width:100%}
.wrap{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
.sec{display:flex;flex-direction:column;gap:16px}
.logo{display:block;align-self:flex-start;max-height:40px;width:auto}
.eyebrow{font-family:var(--display);font-weight:500;font-size:14px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}
h1{font-family:var(--display);font-weight:500;font-size:clamp(32px,8vw,52px);line-height:1.1;letter-spacing:-.02em;margin:0;text-wrap:balance}
h1 b{color:var(--primary);font-weight:500}
h2{font-family:var(--display);font-weight:500;font-size:22px;margin:0}
.head{display:flex;flex-direction:column;gap:12px}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;color:var(--muted);font-size:15px}
.meta span{display:inline-flex;gap:8px;align-items:center}
.time{font-family:var(--mono);font-variant-numeric:tabular-nums}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:14px;color:var(--muted)}
.chip{--c:var(--muted);display:inline-flex;align-items:center;gap:6px;font-family:var(--display);font-weight:500;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,var(--card));color:var(--c)}
.chip.all{background:var(--soft)}
.chip::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.parallel-note{background:color-mix(in srgb,var(--note) 12%,var(--card));border-radius:16px;padding:12px 16px;font-size:14px;display:flex;gap:12px;align-items:flex-start}
.parallel-note::before{content:"";flex:none;width:4px;align-self:stretch;border-radius:2px;background:var(--note)}
.parallel-note div{white-space:pre-line}

.agenda,.lane-head{display:grid;grid-template-columns:${template}}
.agenda{gap:12px 10px;align-items:stretch}
.t{font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums;padding-top:12px;color:var(--muted);line-height:1.3}
.t b{display:block;color:var(--fg);font-weight:500;font-size:14px}
.ev{--c:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;min-width:0;display:flex;flex-direction:column;gap:8px}
.ev h3{font-family:var(--display);font-weight:500;font-size:16px;line-height:1.3;margin:0;text-wrap:balance}
.ev .spk{font-family:var(--display);font-weight:500;font-size:14px;color:var(--fg)}
.ev .spk .lbl{font-weight:400;color:var(--muted)}
.ev .when{font-family:var(--mono);font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.ev.track{border-color:var(--c);border-width:1px 1px 1px 4px}
.ev.shared{background:var(--soft);border-style:dashed}
.ev.key{border-color:var(--accent);border-style:solid;border-width:1px 1px 1px 4px}
.ev.ghost{background:transparent;border-color:var(--c);border-style:dashed;border-width:1px 1px 1px 4px;color:var(--muted);font-size:14px;justify-content:center}
.lane-head{gap:10px}
.lane-head div{--c:var(--muted);font-family:var(--display);font-weight:500;font-size:13px;letter-spacing:.04em;text-transform:uppercase;padding:6px 0;border-bottom:3px solid var(--c);color:var(--c)}
.small{font-size:13px;color:var(--muted);margin:-4px 0 0;white-space:pre-line}

.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.person{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;gap:12px;align-items:center;min-width:0}
.av{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-weight:500;color:#fff;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover}
.person b{font-family:var(--display);font-weight:500;display:block}
.person span{font-size:13px;color:var(--muted)}
.btn{display:inline-flex;align-self:flex-start;background:var(--primary);color:var(--bg);font-family:var(--display);font-weight:500;padding:10px 20px;border-radius:999px;text-decoration:none}
.btn:focus-visible{outline:2px solid var(--fg);outline-offset:2px}

@media (max-width:520px){
  .agenda,.lane-head{grid-template-columns:${mobileTemplate}}
  .agenda{column-gap:8px}
  .lane-head{gap:8px}
  .ev{padding:10px 10px}
  .ev h3{font-size:14px}
}
`.trim()
}
