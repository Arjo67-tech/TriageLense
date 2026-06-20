"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Camera, ShieldCheck, X } from "lucide-react";
import { XRayBodyMap } from "./XRayBodyMap";
import { IlluminatedHero } from "@/components/ui/illuminated-hero";
import type { ConditionConfig } from "@/lib/triagelens/condition-map";

export function TriageLensHome() {
  const [selected,setSelected]=useState<ConditionConfig|null>(null);
  const scrollToMap=()=>document.getElementById("body-map")?.scrollIntoView({behavior:"smooth",block:"center"});
  return <main className="site-shell">
    <div className="noise"/><div className="grid-bg"/><div className="orb orb-one"/><div className="orb orb-two"/>
    <nav className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><span/></span>TriageLens</a>
      <div className="nav-center"><a href="#body-map">Body map</a><a href="#how">How it works</a><a href="#safety">Safety</a></div>
      <button className="nav-cta" onClick={scrollToMap}>Begin screening <ArrowRight size={15}/></button>
    </nav>

    <IlluminatedHero onStart={scrollToMap} onLearn={()=>document.getElementById("how")?.scrollIntoView({behavior:"smooth"})}/>

    <XRayBodyMap onSelect={setSelected}/>

    <section id="how" className="how-strip">
      <span className="section-number">01</span><div><small>GUIDED BY DESIGN</small><h2>From body map to a focused screening in seconds.</h2></div>
      <div className="steps"><span><b>01</b>Select a condition</span><i/><span><b>02</b>Frame the right view</span><i/><span><b>03</b>Begin screening</span></div>
    </section>

    <footer id="safety" className="disclaimer"><ShieldCheck size={18}/><p><b>Screening, not a diagnosis.</b> TriageLens is a triage support tool. If symptoms are severe or sudden, call local emergency services.</p></footer>

    <AnimatePresence>{selected&&<motion.div className="assessment-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setSelected(null)}>
      <motion.aside className="assessment-panel" initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{type:"spring",stiffness:250,damping:28}} onClick={e=>e.stopPropagation()}>
        <button className="close-panel" onClick={()=>setSelected(null)}><X size={18}/></button>
        <div className="panel-kicker"><span/> GUIDED CAMERA SCREENING</div>
        <h2>{selected.displayName}</h2><p className="panel-desc">{selected.shortDescription}</p>
        <div className="frame-preview"><div className="corner tl"/><div className="corner tr"/><div className="corner bl"/><div className="corner br"/><Camera size={35}/><span>Camera preview begins after continue</span></div>
        <div className="instruction"><small>WHAT TO SHOW</small><p>{selected.cameraPrompt}</p></div>
        <div className="panel-meta"><span><small>FOCUS AREA</small>{selected.primaryAssessmentTarget}</span><span><small>VIEW</small>{selected.recommendedView.replace("_"," ")}</span></div>
        <div className="caution"><ShieldCheck size={16}/>{selected.cautionText}</div>
        <button className="continue-button" onClick={()=>{ window.location.href=`/assessment/${selected.id}` }}>Continue to assessment <ArrowRight size={17}/></button>
        <p className="backend-note">Camera permissions and live analysis connect on the assessment route.</p>
      </motion.aside>
    </motion.div>}</AnimatePresence>
  </main>;
}
