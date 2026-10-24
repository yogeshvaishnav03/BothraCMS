"use client";

import React, { useRef, useState } from "react";

export type Tool = "cloud" | "arrow" | "rect" | "pen" | "text" | "none";
export interface Shape {
  type: "pen" | "arrow" | "rect" | "cloud" | "text";
  color: string;
  points: [number, number][];
  text?: string;
}

/** A revision cloud: a box with scalloped edges, the usual way to mark a change on a drawing. */
function cloudPath(x1: number, y1: number, x2: number, y2: number) {
  const [l, r] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [t, b] = [Math.min(y1, y2), Math.max(y1, y2)];
  const w = r - l;
  const h = b - t;
  const step = Math.max(8, Math.min(28, Math.min(w, h) / 3));
  let d = `M ${l} ${t}`;
  const edge = (fx: number, fy: number, tx: number, ty: number) => {
    const len = Math.hypot(tx - fx, ty - fy);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 1; i <= n; i++) {
      const px = fx + ((tx - fx) * i) / n;
      const py = fy + ((ty - fy) * i) / n;
      d += ` A ${len / n / 2} ${len / n / 2} 0 0 1 ${px} ${py}`;
    }
  };
  edge(l, t, r, t);
  edge(r, t, r, b);
  edge(r, b, l, b);
  edge(l, b, l, t);
  return d;
}

export function ShapeView({ s, w, h, faded }: { s: Shape; w: number; h: number; faded?: boolean }) {
  const P = s.points.map(([x, y]) => [x * w, y * h] as const);
  const common = { stroke: s.color, strokeWidth: 2.5, fill: "none", opacity: faded ? 0.55 : 1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (s.type === "pen") return <polyline points={P.map((p) => p.join(",")).join(" ")} {...common} />;
  if (s.type === "rect") return <rect x={Math.min(P[0][0], P[1][0])} y={Math.min(P[0][1], P[1][1])} width={Math.abs(P[1][0] - P[0][0])} height={Math.abs(P[1][1] - P[0][1])} {...common} />;
  if (s.type === "cloud") return <path d={cloudPath(P[0][0], P[0][1], P[1][0], P[1][1])} {...common} />;
  if (s.type === "arrow") {
    const [a, b] = P;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const head = 14;
    const l = [b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45)];
    const r = [b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45)];
    return (
      <g {...common}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
        <polyline points={`${l.join(",")} ${b.join(",")} ${r.join(",")}`} />
      </g>
    );
  }
  // A note: text on a white label so it reads over the drawing, sized with the sheet.
  const lines = (s.text || "").split("\n");
  const fs = Math.max(9, Math.min(14, w / 85));
  return (
    <g opacity={faded ? 0.7 : 1}>
      <rect x={P[0][0] - 4} y={P[0][1] - fs * 1.15} width={Math.max(...lines.map((x) => x.length)) * fs * 0.57 + 10} height={lines.length * fs * 1.3 + 6} rx={4} fill="white" stroke={s.color} strokeWidth={1.5} />
      {lines.map((line, i) => (
        <text key={i} x={P[0][0] + 1} y={P[0][1] + i * fs * 1.3} fill={s.color} fontSize={fs} fontWeight={600} fontFamily="ui-sans-serif, system-ui">
          {line}
        </text>
      ))}
    </g>
  );
}

/**
 * The layer over a drawing sheet: shows everyone's marks and lets this person
 * add theirs with the chosen tool. Points are kept as fractions of the sheet.
 */
export default function MarkupLayer({
  width,
  height,
  tool,
  color,
  mine,
  others,
  onChange,
  onAskText,
}: {
  width: number;
  height: number;
  tool: Tool;
  color: string;
  mine: Shape[];
  others: { name: string; shapes: Shape[] }[];
  onChange: (shapes: Shape[]) => void;
  onAskText: () => string | null;
}) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const down = (e: React.PointerEvent) => {
    if (tool === "none") return;
    e.preventDefault();
    const p = at(e);
    if (tool === "text") {
      const text = onAskText();
      if (text?.trim()) onChange([...mine, { type: "text", color, points: [p], text: text.trim().slice(0, 300) }]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft({ type: tool, color, points: tool === "pen" ? [p] : [p, p] });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = at(e);
    setDraft(draft.type === "pen" ? { ...draft, points: draft.points.length < 2000 ? [...draft.points, p] : draft.points } : { ...draft, points: [draft.points[0], p] });
  };
  const up = () => {
    if (!draft) return;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    // Ignore a tap that drew nothing.
    if (Math.hypot((b[0] - a[0]) * width, (b[1] - a[1]) * height) > 6) onChange([...mine, { ...draft, points: draft.points.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]) }]);
    setDraft(null);
  };

  return (
    <svg
      ref={svg}
      width={width}
      height={height}
      className="absolute left-0 top-0"
      style={{ touchAction: tool === "none" ? "auto" : "none", cursor: tool === "none" ? "default" : tool === "text" ? "text" : "crosshair" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDraft(null)}
    >
      {others.map((o, i) => o.shapes.map((s, j) => <ShapeView key={`o${i}-${j}`} s={s} w={width} h={height} faded />))}
      {mine.map((s, i) => (
        <ShapeView key={`m${i}`} s={s} w={width} h={height} />
      ))}
      {draft && <ShapeView s={draft} w={width} h={height} />}
    </svg>
  );
}
