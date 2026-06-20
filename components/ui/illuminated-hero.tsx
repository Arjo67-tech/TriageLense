"use client";

import { motion } from "framer-motion";
import { ArrowDown, ChevronRight, CircleHelp, Camera, Sparkles } from "lucide-react";

export function IlluminatedHero({ onStart, onLearn }: { onStart: () => void; onLearn: () => void }) {
  return (
    <section className="hero illuminated-hero">
      <div className="illumination-field" aria-hidden="true">
        <div className="illumination illumination-top" />
        <div className="illumination illumination-bottom" />
        <div className="illumination-core" />
      </div>

      <motion.div className="eyebrow" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.1}}>
        <span className="live-dot"/> LIVE CAMERA TRIAGE INTERFACE <Sparkles size={13}/>
      </motion.div>

      <motion.h1 initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.18,duration:.65}}>
        See the signals.<br/>
        <span className="illuminated-title" data-text="Know what comes next.">Know what comes next.</span>
      </motion.h1>

      <motion.p className="hero-copy" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.3}}>
        Camera-based screening for visible neurological, movement, and musculoskeletal markers—built to make the first step clearer.
      </motion.p>

      <motion.div className="hero-actions" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.4}}>
        <button className="primary-button" onClick={onStart}><Camera size={17}/> Start with body map <ChevronRight size={16}/></button>
        <button className="secondary-button" onClick={onLearn}><CircleHelp size={17}/> How it works</button>
      </motion.div>

      <motion.div className="scroll-cue" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1.2}}><span>SELECT A CONDITION</span><ArrowDown size={14}/></motion.div>

      <svg className="illuminated-filter" aria-hidden="true">
        <defs>
          <filter id="triagelens-title-glow" colorInterpolationFilters="sRGB" x="-50%" y="-220%" width="200%" height="540%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur3"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur10"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="25" result="blur25"/>
            <feColorMatrix in="blur3" result="cyanCore" type="matrix" values="0.75 0 0 0 0.2  0 1 0 0 0.88  0 0 1 0 0.95  0 0 0 .9 0"/>
            <feColorMatrix in="blur10" result="cyanHalo" type="matrix" values="0.2 0 0 0 0  0 .9 0 0 .38  0 0 1 0 .65  0 0 0 .65 0"/>
            <feColorMatrix in="blur25" result="blueHalo" type="matrix" values=".12 0 0 0 0  0 .35 0 0 .1  0 0 .9 0 .35  0 0 0 .55 0"/>
            <feMerge><feMergeNode in="blueHalo"/><feMergeNode in="cyanHalo"/><feMergeNode in="cyanCore"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      </svg>
    </section>
  );
}
