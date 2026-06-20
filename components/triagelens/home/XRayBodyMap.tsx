"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ParticleXRayBody } from "@/components/ui/particle-xray-body";
import { ConditionCalloutCard } from "./ConditionCalloutCard";
import { conditions, type ConditionConfig } from "@/lib/triagelens/condition-map";

const connectorPath: Record<string,string> = {
  "left-top":"M49 13 C35 13 27 14 20 17", "right-top":"M54 15 C66 14 73 14 80 17",
  "left-middle":"M45 23 C34 25 27 32 20 38", "right-middle":"M51 35 C64 34 72 37 80 42",
  "left-bottom":"M43 57 C34 59 26 65 20 70", "right-bottom":"M66 49 C72 51 76 57 80 63",
  "bottom":"M57 75 C61 80 63 86 62 92"
};

export function XRayBodyMap({ onSelect }: { onSelect: (condition: ConditionConfig) => void }) {
  const [hovered,setHovered]=useState<string|null>(null);
  return <section className="body-map" id="body-map" aria-label="Interactive condition body map">
    <div className="map-stage">
      <div className="scan-label"><span/> BODY MAP / LIVE</div>
      <div className="body-aura"/><div className="scan-line"/>
      <ParticleXRayBody className="particle-body"/>
      <svg className="connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {conditions.map((c,i)=><motion.path key={c.id} d={connectorPath[c.cardPosition]} className={hovered===c.id?"connector active":"connector"} initial={{pathLength:0,opacity:0}} animate={{pathLength:1,opacity:1}} transition={{delay:.58+i*.035,duration:.5}} />)}
      </svg>
      {conditions.map((c,i)=><motion.button key={c.id} className={`hotspot ${hovered===c.id?"active":""}`} style={{left:`${c.hotspot.x}%`,top:`${c.hotspot.y}%`,"--condition":c.color} as React.CSSProperties} initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:.48+i*.045,type:"spring"}} onMouseEnter={()=>setHovered(c.id)} onMouseLeave={()=>setHovered(null)} onClick={()=>onSelect(c)} aria-label={`${c.displayName}: ${c.hotspot.label}`}><span/><i/></motion.button>)}
      {conditions.map((c,i)=><ConditionCalloutCard key={c.id} condition={c} index={i} active={hovered===c.id} onHover={setHovered} onSelect={onSelect}/>)}
    </div>
    <div className="mobile-condition-grid">
      {conditions.map((c,i)=><ConditionCalloutCard key={c.id} condition={c} index={i} active={hovered===c.id} onHover={setHovered} onSelect={onSelect}/>)}
    </div>
  </section>
}
