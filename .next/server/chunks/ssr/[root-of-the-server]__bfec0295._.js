module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/components/Particles.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Particles
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function Particles() {
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const rafRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const prefersReduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", {
            alpha: true
        });
        if (!ctx) return;
        let width = 0;
        let height = 0;
        const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
        const resize = ()=>{
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const particles = [];
        const seedParticles = ()=>{
            particles.length = 0;
            const count = prefersReduced ? 12 : 36;
            for(let i = 0; i < count; i++){
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: -0.15 - Math.random() * 0.25,
                    size: 0.8 + Math.random() * 1.8,
                    alpha: 0.05 + Math.random() * 0.1,
                    halo: Math.random() * 0.08
                });
            }
        };
        const draw = ()=>{
            // Soft fade to create trailing effect
            ctx.fillStyle = "rgba(7,7,10,0.06)";
            ctx.fillRect(0, 0, width, height);
            for (const p of particles){
                // slight wandering
                p.x += p.vx + Math.sin((p.y + p.x) * 0.002) * 0.08;
                p.y += p.vy;
                // wrap to bottom/top to keep flow
                if (p.y < -20) {
                    p.y = height + 10;
                    p.x = Math.random() * width;
                }
                if (p.x < -20) p.x = width + 10;
                if (p.x > width + 20) p.x = -10;
                // incense particle (soft light plume)
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40);
                grad.addColorStop(0, "rgba(240,240,255,0.06)");
                grad.addColorStop(1, "rgba(240,240,255,0.0)");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 40 * p.size, 0, Math.PI * 2);
                ctx.fill();
                // occasional halo shimmer with neon crimson accent
                if (Math.random() < 0.01) {
                    p.halo = Math.min(1, p.halo + 0.15);
                }
                if (p.halo > 0.001) {
                    const r = 28 * p.size + Math.random() * 10;
                    const g2 = ctx.createRadialGradient(p.x, p.y, r * 0.25, p.x, p.y, r);
                    g2.addColorStop(0, `rgba(225,6,60,${0.08 * p.halo})`);
                    g2.addColorStop(1, "rgba(225,6,60,0)");
                    ctx.strokeStyle = `rgba(225,6,60,${0.35 * p.halo})`;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = g2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fill();
                    p.halo *= 0.985;
                }
            }
        };
        const loop = ()=>{
            draw();
            rafRef.current = requestAnimationFrame(loop);
        };
        const onResize = ()=>{
            resize();
            seedParticles();
        };
        const obs = new ResizeObserver(onResize);
        obs.observe(canvas);
        resize();
        seedParticles();
        if (!prefersReduced) {
            rafRef.current = requestAnimationFrame(loop);
        } else {
            // single draw for reduced motion
            draw();
        }
        return ()=>{
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            obs.disconnect();
        };
    }, []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
        ref: canvasRef,
        "aria-hidden": "true",
        className: "pointer-events-none fixed inset-0 -z-10",
        style: {
            filter: "blur(0.3px)"
        }
    }, void 0, false, {
        fileName: "[project]/components/Particles.tsx",
        lineNumber: 140,
        columnNumber: 5
    }, this);
}
}),
"[project]/node_modules/next/dist/server/route-modules/app-page/module.compiled.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
else {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    else {
        if ("TURBOPACK compile-time truthy", 1) {
            if ("TURBOPACK compile-time truthy", 1) {
                module.exports = __turbopack_context__.r("[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)");
            } else //TURBOPACK unreachable
            ;
        } else //TURBOPACK unreachable
        ;
    }
} //# sourceMappingURL=module.compiled.js.map
}),
"[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

module.exports = __turbopack_context__.r("[project]/node_modules/next/dist/server/route-modules/app-page/module.compiled.js [app-ssr] (ecmascript)").vendored['react-ssr'].ReactJsxDevRuntime; //# sourceMappingURL=react-jsx-dev-runtime.js.map
}),
"[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

module.exports = __turbopack_context__.r("[project]/node_modules/next/dist/server/route-modules/app-page/module.compiled.js [app-ssr] (ecmascript)").vendored['react-ssr'].React; //# sourceMappingURL=react.js.map
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__bfec0295._.js.map