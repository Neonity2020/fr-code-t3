import type { SVGProps } from "react";

/**
 * FR Code wordmark.
 *
 * Outlines are baked from Avenir Next Bold at +60/1000em tracking, which
 * puts the mark's proportions (viewBox aspect 1.72) and
 * weight next to the T3 mark it replaces (1.66), so `h-*` sizing at the
 * call sites lines up as before.
 *
 * NOTE: glyph outlines come out of the font in a Y-up coordinate system
 * while SVG is Y-down, so the extraction applies a flip. Without it the
 * mark renders upside down -- an inverted FR reads as a single "B" glyph
 * at sidebar size.
 */
export function FRWordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="73.00 -708.00 1215.00 708.00" xmlns="http://www.w3.org/2000/svg">
      <path d="M242.0 -562 V-416 H516.0 V-275 H242.0 V0 H73.0 V-708 H539.0 V-562ZM1088 0 935 -281 H877 V0 H709 V-708 H979Q1030 -708 1078.5 -697.5Q1127 -687 1165.5 -662.0Q1204 -637 1227.0 -596.0Q1250 -555 1250 -494Q1250 -422 1211.0 -373.0Q1172 -324 1103 -303 L1288 0ZM1081 -491Q1081 -516 1070.5 -531.5Q1060 -547 1043.5 -555.5Q1027 -564 1006.5 -567.0Q986 -570 967 -570 H876 V-405 H957Q978 -405 1000.0 -408.5Q1022 -412 1040.0 -421.0Q1058 -430 1069.5 -447.0Q1081 -464 1081 -491Z" fill="currentColor" />
    </svg>
  );
}
