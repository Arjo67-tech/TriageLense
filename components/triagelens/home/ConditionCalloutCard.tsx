"use client";

import { motion } from "framer-motion";
import { Activity, Bone, Brain, BrainCircuit, Hand, Network, PersonStanding, ArrowUpRight } from "lucide-react";
import type { ConditionConfig } from "@/lib/triagelens/condition-map";

const icons = { hand: Hand, brain: Brain, "brain-circuit": BrainCircuit, activity: Activity, network: Network, "person-standing": PersonStanding, bone: Bone };

export function ConditionCalloutCard({ condition, index, active, onHover, onSelect }: { condition: ConditionConfig; index: number; active: boolean; onHover: (id: string | null) => void; onSelect: (condition: ConditionConfig) => void }) {
  const Icon=icons[condition.iconName];
  return (
    <motion.button
      className={`condition-card card-${condition.cardPosition} ${active ? "is-active" : ""}`}
      initial={{opacity:0,y:18,scale:.96,filter:"blur(8px)"}} animate={{opacity:1,y:0,scale:1,filter:"blur(0px)"}}
      transition={{delay:.8+index*.07,duration:.42,ease:[.2,.8,.2,1]}} whileHover={{y:-4,scale:1.018}} whileTap={{scale:.98}}
      onMouseEnter={()=>onHover(condition.id)} onMouseLeave={()=>onHover(null)} onFocus={()=>onHover(condition.id)} onBlur={()=>onHover(null)} onClick={()=>onSelect(condition)}
      aria-label={`Open ${condition.displayName} screening`}
    >
      <span className="card-shine" />
      <span className="icon-shell" style={{"--condition":condition.color} as React.CSSProperties}>
        <motion.span initial={{scale:0}} animate={{scale:1}} transition={{delay:.9+index*.07,type:"spring",stiffness:220,damping:16}}><Icon size={17}/></motion.span>
      </span>
      <span className="card-copy">
        <span className="micro-badge"><span/> Camera screening</span>
        <strong>{condition.displayName}</strong>
        <span className="description">{condition.shortDescription}</span>
        <span className="assesses">Assesses <b>{condition.primaryAssessmentTarget}</b></span>
      </span>
      <span className="open-link">Open <ArrowUpRight size={14}/></span>
    </motion.button>
  );
}
