export type ConditionIconName = "hand" | "brain" | "brain-circuit" | "activity" | "network" | "person-standing" | "bone";

export type ConditionConfig = {
  id: string;
  displayName: string;
  shortDescription: string;
  affectedRegions: string[];
  primaryAssessmentTarget: string;
  cameraPrompt: string;
  recommendedView: "face" | "hands" | "full_body" | "joints";
  assessmentMode: string;
  iconName: ConditionIconName;
  color: string;
  hotspot: { label: string; x: number; y: number };
  cardPosition: "left-top" | "left-middle" | "left-bottom" | "right-top" | "right-middle" | "right-bottom" | "bottom";
  cautionText: string;
};

export const conditions: ConditionConfig[] = [
  {
    id: "dementia", displayName: "Dementia", iconName: "brain", color: "#22d3ee",
    shortDescription: "Screens speech, orientation, and response patterns for visible cognitive markers.",
    affectedRegions: ["brain", "speech", "orientation"], primaryAssessmentTarget: "Face & voice",
    cameraPrompt: "Keep your face visible and answer the on-screen orientation and speech prompts clearly.", recommendedView: "face", assessmentMode: "dementia",
    hotspot: { label: "Head / brain", x: 49, y: 13 }, cardPosition: "left-top",
    cautionText: "Cognitive screening only — not a diagnosis."
  },
  {
    id: "alzheimers", displayName: "Alzheimer’s", iconName: "brain-circuit", color: "#a78bfa",
    shortDescription: "Looks at memory, recall, orientation, and language response markers.",
    affectedRegions: ["brain", "memory", "speech"], primaryAssessmentTarget: "Face & voice",
    cameraPrompt: "Keep your face visible and respond to the memory, orientation, and speech prompts.", recommendedView: "face", assessmentMode: "alzheimers",
    hotspot: { label: "Temporal region", x: 54, y: 15 }, cardPosition: "right-top",
    cautionText: "Memory screening only — not a diagnosis."
  },
  {
    id: "huntingtons", displayName: "Huntington’s Disease", iconName: "activity", color: "#38bdf8",
    shortDescription: "Observes movement control, coordination, and upper-body motion markers.",
    affectedRegions: ["brain", "face", "arms", "hands"], primaryAssessmentTarget: "Upper body & hands",
    cameraPrompt: "Show your face, shoulders, arms, and hands for movement and coordination screening.", recommendedView: "full_body", assessmentMode: "huntingtons",
    hotspot: { label: "Head / upper body", x: 45, y: 23 }, cardPosition: "left-middle",
    cautionText: "Sit or stand safely with support nearby."
  },
  {
    id: "multiple-sclerosis", displayName: "Multiple Sclerosis", iconName: "network", color: "#60a5fa",
    shortDescription: "Screens posture, balance, coordination, and limb-control markers.",
    affectedRegions: ["brain", "spine", "eyes", "limbs"], primaryAssessmentTarget: "Spine & posture",
    cameraPrompt: "Show your upper body and, if safe, enough of your body for posture and coordination screening.", recommendedView: "full_body", assessmentMode: "multiple-sclerosis",
    hotspot: { label: "Brain / spine", x: 51, y: 35 }, cardPosition: "right-middle",
    cautionText: "Do not perform movements that feel unsafe."
  },
  {
    id: "parkinsons", displayName: "Parkinson’s", iconName: "hand", color: "#2dd4bf",
    shortDescription: "Screens tremor, tapping speed, expression, speech, and movement speed.",
    affectedRegions: ["hands", "arms", "face", "voice"], primaryAssessmentTarget: "Hands & arms",
    cameraPrompt: "Show both hands clearly for finger-tapping and tremor screening.", recommendedView: "hands", assessmentMode: "parkinsons",
    hotspot: { label: "Hands / arms", x: 66, y: 49 }, cardPosition: "right-bottom",
    cautionText: "Visible-marker screening only — not a diagnosis."
  },
  {
    id: "muscular-dystrophy", displayName: "Muscular Dystrophy", iconName: "person-standing", color: "#818cf8",
    shortDescription: "Observes posture, movement, and visible muscle-weakness markers.",
    affectedRegions: ["shoulders", "hips", "legs", "posture"], primaryAssessmentTarget: "Full-body posture",
    cameraPrompt: "Step back if possible so your shoulders, torso, hips, and legs are visible.", recommendedView: "full_body", assessmentMode: "muscular-dystrophy",
    hotspot: { label: "Shoulders / hips", x: 43, y: 57 }, cardPosition: "left-bottom",
    cautionText: "Movement observation only — not a diagnosis."
  },
  {
    id: "arthritis", displayName: "Arthritis", iconName: "bone", color: "#67e8f9",
    shortDescription: "Screens visible joint movement, stiffness, swelling, and range of motion.",
    affectedRegions: ["hands", "wrists", "knees", "shoulders"], primaryAssessmentTarget: "Selected joint",
    cameraPrompt: "Show the affected joint clearly, such as your hand, wrist, knee, shoulder, or elbow.", recommendedView: "joints", assessmentMode: "arthritis",
    hotspot: { label: "Hands / knees", x: 57, y: 75 }, cardPosition: "bottom",
    cautionText: "Stop if movement causes pain."
  }
];
