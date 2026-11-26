"use client";

import React, { useId, useMemo, useState } from "react";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";

/**
 * Interactive roofline for Qwen3-0.6B decode on an RTX 3060, drawn with
 * rough.js (Excalidraw's renderer) and Excalifont so it matches the post's
 * Excalidraw diagrams. Emitted from Markdown as <div data-roofline></div>.
 * Uses NVIDIA's spec numbers; the slider moves a batch along the roof.
 */

const BW = 360; // GB/s
const PEAK = 51.2; // TFLOP/s, dense FP16 tensor cores
const PARAMS = 0.6e9;
const RIDGE = (PEAK * 1e3) / BW; // FLOP per byte of weights; = batch size for bf16

// Excalidraw's palette
const BLUE = "#1971c2";
const RED = "#e03131";
const INK = "#1e1e1e";
const GREY = "#868e96";
const FONT = "Excalifont, 'Comic Sans MS', cursive";

const VW = 1000, VH = 640;
const X0 = 80, X1 = 950, Y0 = 560, Y1 = 110;
const XMAX = 300, YMAX = 64;
const px = (b: number) => X0 + (b / XMAX) * (X1 - X0);
const py = (t: number) => Y0 - (t / YMAX) * (Y0 - Y1);

const tflops = (b: number) => Math.min((BW * b) / 1e3, PEAK);
const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

const gen = rough.generator();

// Excalidraw's defaults: roughness 1 ("artist"), fillWeight/hachureGap from the stroke width
function opts(seed: number, stroke: string, strokeWidth: number, extra: Options = {}): Options {
    return {
        seed,
        roughness: 1,
        stroke,
        strokeWidth,
        fillWeight: strokeWidth / 2,
        hachureGap: strokeWidth * 4,
        ...extra,
    };
}

function Rough({ d }: { d: Drawable }) {
    return (
        <>
            {gen.toPaths(d).map((p, i) => (
                <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />
            ))}
        </>
    );
}

export default function RooflineExplorer() {
    const id = useId();
    const [batch, setBatch] = useState(8);
    const mem = batch < RIDGE;
    const color = mem ? BLUE : RED;
    const tf = tflops(batch);
    const tokS = (tf * 1e12) / (2 * PARAMS);

    const rx = px(RIDGE), ry = py(PEAK);
    const slope = (Math.atan2(py(0) - ry, rx - px(0)) * 180) / Math.PI;

    // everything except the moving dot, drawn once
    const board = useMemo(() => {
        const top = Y1 - 20;
        return [
            gen.rectangle(X0, top, rx - X0, Y0 - top, opts(11, "transparent", 1, { fill: "#e7f5ff", fillStyle: "solid" })),
            gen.rectangle(rx, top, X1 - rx, Y0 - top, opts(12, "transparent", 1, { fill: "#fff5f5", fillStyle: "solid" })),
            // axes with arrowheads
            gen.line(X0, Y0, X1 + 24, Y0, opts(21, INK, 2)),
            gen.linearPath([[X1 + 8, Y0 - 10], [X1 + 24, Y0], [X1 + 8, Y0 + 10]], opts(22, INK, 2)),
            gen.line(X0, Y0, X0, Y1 - 44, opts(23, INK, 2)),
            gen.linearPath([[X0 - 10, Y1 - 28], [X0, Y1 - 44], [X0 + 10, Y1 - 28]], opts(24, INK, 2)),
            // ridge drop line
            gen.line(rx, ry, rx, Y0, opts(31, GREY, 1.5, { strokeLineDash: [8, 9], disableMultiStroke: true })),
            // the roof
            gen.line(px(0) + 6, py(0) - 4, rx, ry, opts(41, BLUE, 4)),
            gen.line(rx, ry, X1, ry, opts(42, RED, 4)),
            gen.ellipse(rx, ry, 18, 18, opts(43, INK, 1, { fill: INK, fillStyle: "solid" })),
        ];
    }, [rx, ry]);

    const dx = px(batch), dy = py(tf);
    const dot = useMemo(() => gen.ellipse(dx, dy, 26, 26, opts(51, color, 1, { fill: color, fillStyle: "solid" })), [dx, dy, color]);
    // on the blue slope the label sits beside the dot on the side away from the
    // line; on the red roof it sits underneath
    const labelLeft = !mem && dx > px(XMAX * 0.7);
    const lx = dx + (labelLeft ? -26 : mem ? 40 : 26);
    // a halo in the region's fill keeps the label readable over the dashed ridge line
    const halo = { stroke: mem ? "#e7f5ff" : "#fff5f5", strokeWidth: 8, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
    const anchor = labelLeft ? "end" : "start";

    return (
        <figure className="blog-wide not-prose my-10" style={{ textTransform: "none" }}>
            <div className="overflow-hidden rounded-xl bg-white p-2 sm:p-4">
                <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`} style={{ fontFamily: FONT }}>
                    <title id={`${id}-t`}>
                        {`Roofline model for an RTX 3060: performance rises with batch size at ${BW} GB/s until it reaches ${PEAK} TFLOP/s at batch ${Math.round(RIDGE)}.`}
                    </title>

                    {board.map((d, i) => <Rough key={i} d={d} />)}

                    <text x={VW / 2} y={52} fontSize={38} fill={INK} textAnchor="middle">Roofline model (RTX 3060)</text>
                    <text x={(X0 + rx) / 2} y={Y1 + 22} fontSize={26} fill={BLUE} textAnchor="middle">memory-bound</text>
                    <text x={(rx + X1) / 2} y={Y1 + 22} fontSize={26} fill={RED} textAnchor="middle">compute-bound</text>

                    {[0, 50, 100, 150, 200, 250, 300].map((b) => (
                        <text key={b} x={px(b)} y={Y0 + 28} fontSize={18} fill={GREY} textAnchor="middle">{b}</text>
                    ))}
                    {[20, 40].map((t) => (
                        <text key={t} x={X0 - 12} y={py(t) + 6} fontSize={18} fill={GREY} textAnchor="end">{t}</text>
                    ))}
                    <text x={(X0 + X1) / 2} y={Y0 + 66} fontSize={24} fill={INK} textAnchor="middle">batch size (= FLOP / byte of weights)</text>
                    <text x={32} y={(Y0 + Y1) / 2} fontSize={24} fill={INK} textAnchor="middle" transform={`rotate(-90 32 ${(Y0 + Y1) / 2})`}>TFLOP/s</text>

                    <text x={px(42)} y={py(tflops(42)) - 20} fontSize={24} fill={BLUE} transform={`rotate(${-slope} ${px(42)} ${py(tflops(42)) - 20})`}>
                        slope = {BW} GB/s
                    </text>
                    <text x={px(290)} y={ry - 18} fontSize={24} fill={RED} textAnchor="end">peak = {PEAK} TFLOP/s</text>
                    <text x={rx} y={ry - 52} fontSize={22} fill="#495057" textAnchor="middle">ridge point</text>
                    <text x={rx} y={ry - 24} fontSize={22} fill="#495057" textAnchor="middle">batch ≈ {Math.round(RIDGE)}</text>

                    <Rough d={dot} />
                    {mem ? (
                        <text x={lx} y={Math.min(dy + 44, Y0 - 14)} fontSize={22} fill={color} textAnchor={anchor} {...halo}>batch {batch}: ≤ {fmt(tokS)} tok/s</text>
                    ) : (
                        <>
                            <text x={lx} y={dy + 42} fontSize={24} fill={color} textAnchor={anchor} {...halo}>batch {batch}</text>
                            <text x={lx} y={dy + 70} fontSize={22} fill={color} textAnchor={anchor} {...halo}>≤ {fmt(tokS)} tok/s</text>
                        </>
                    )}
                </svg>

                <div className="px-2 pb-2 pt-1 sm:px-4" style={{ fontFamily: FONT }}>
                    <label htmlFor={`${id}-s`} className="flex items-baseline justify-between gap-3 whitespace-nowrap text-sm text-neutral-700 sm:text-base">
                        <span>
                            <span className="sm:hidden">drag the batch size</span>
                            <span className="hidden sm:inline">drag to change the batch size</span>
                        </span>
                        <span style={{ color }}>{mem ? "memory-bound" : "compute-bound"}</span>
                    </label>
                    <input
                        id={`${id}-s`}
                        type="range"
                        min={1}
                        max={XMAX}
                        step={1}
                        value={batch}
                        onChange={(e) => setBatch(Number(e.target.value))}
                        className="mt-2 w-full"
                        style={{ accentColor: color }}
                        aria-valuetext={`batch ${batch}, at most ${fmt(tokS)} tokens per second`}
                    />
                </div>
            </div>
        </figure>
    );
}
