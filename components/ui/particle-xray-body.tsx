"use client";

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; tx: number; ty: number; vx: number; vy: number; size: number; alpha: number; phase: number };

function drawTarget(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "white"; ctx.fillStyle = "white"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, w / 150);
  ctx.beginPath(); ctx.ellipse(cx, h * .12, w * .07, h * .075, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, h * .105, w * .025, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, h * .19); ctx.lineTo(cx, h * .59); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - w * .14, h * .25); ctx.quadraticCurveTo(cx, h * .21, cx + w * .14, h * .25); ctx.stroke();
  for (let i=0;i<6;i++) { const y=h*(.285+i*.045); const rw=w*(.115-i*.007); ctx.beginPath(); ctx.ellipse(cx,y,rw,h*.028,0,0,Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx-w*.14,h*.25); ctx.lineTo(cx-w*.21,h*.43); ctx.lineTo(cx-w*.18,h*.58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+w*.14,h*.25); ctx.lineTo(cx+w*.21,h*.43); ctx.lineTo(cx+w*.18,h*.58); ctx.stroke();
  [[-.18,.58],[.18,.58]].forEach(([x,y])=>{ ctx.beginPath(); ctx.arc(cx+w*x,h*y,w*.018,0,Math.PI*2); ctx.fill(); });
  ctx.beginPath(); ctx.ellipse(cx,h*.59,w*.105,h*.045,0,0,Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-w*.075,h*.61); ctx.lineTo(cx-w*.095,h*.77); ctx.lineTo(cx-w*.075,h*.94); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+w*.075,h*.61); ctx.lineTo(cx+w*.095,h*.77); ctx.lineTo(cx+w*.075,h*.94); ctx.stroke();
  [[-.095,.77],[.095,.77]].forEach(([x,y])=>{ ctx.beginPath(); ctx.arc(cx+w*x,h*y,w*.018,0,Math.PI*2); ctx.stroke(); });
}

export function ParticleXRayBody({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let frame = 0, particles: Particle[] = [], started = performance.now();
    const setup = () => {
      const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio,2); canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
      const off=document.createElement("canvas"); off.width=Math.round(rect.width); off.height=Math.round(rect.height); const o=off.getContext("2d")!; drawTarget(o,off.width,off.height);
      const data=o.getImageData(0,0,off.width,off.height).data, targets:{x:number,y:number}[]=[];
      for(let y=0;y<off.height;y+=5) for(let x=0;x<off.width;x+=5) if(data[(y*off.width+x)*4+3]>50) targets.push({x,y});
      particles=targets.slice(0,680).map((t,i)=>({x:Math.random()<.5?-40:rect.width+40,y:Math.random()*rect.height,tx:t.x,ty:t.y,vx:0,vy:0,size:.7+Math.random()*1.6,alpha:.35+Math.random()*.65,phase:i*.37})); started=performance.now();
    };
    const render=(now:number)=>{ const rect=canvas.getBoundingClientRect(); ctx.clearRect(0,0,rect.width,rect.height); const settled=Math.min(1,(now-started)/780); particles.forEach((p,i)=>{ const ease=.035+settled*.055; p.vx=(p.vx+(p.tx-p.x)*ease)*.76; p.vy=(p.vy+(p.ty-p.y)*ease)*.76; p.x+=p.vx; p.y+=p.vy; const shimmer=Math.sin(now*.003+p.phase)*.8; ctx.beginPath(); ctx.fillStyle=i%17===0?`rgba(167,139,250,${p.alpha*.7})`:i%4===0?`rgba(34,211,238,${p.alpha})`:`rgba(210,247,255,${p.alpha})`; ctx.shadowBlur=8; ctx.shadowColor="#22d3ee"; ctx.arc(p.x+shimmer*.4,p.y+shimmer*.3,p.size,0,Math.PI*2); ctx.fill(); }); frame=requestAnimationFrame(render); };
    setup(); frame=requestAnimationFrame(render); const ro=new ResizeObserver(setup); ro.observe(canvas); return()=>{cancelAnimationFrame(frame);ro.disconnect()};
  },[]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
