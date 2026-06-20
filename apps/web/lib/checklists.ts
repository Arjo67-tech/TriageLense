// ──────────────────────────────────────────────────────────
//  User-reported checklists, keyed by `${module}:${stepId}`.
//  These feed UserInputs that the detectors read. Items map 1:1
//  to the ids the analyzeX() functions look for.
// ──────────────────────────────────────────────────────────
export interface CheckItem {
  id: string;
  label: string;
  /** if true, the input default is "yes/checked" (used for safety affirmatives) */
  defaultOn?: boolean;
  /** numeric free-entry field (e.g. body temperature) */
  numeric?: boolean;
}

export const CHECKLISTS: Record<string, CheckItem[]> = {
  "concussion:danger": [
    { id: "loss_of_consciousness", label: "Lost consciousness (even briefly)" },
    { id: "seizure", label: "Had a seizure" },
    { id: "repeated_vomiting", label: "Repeated vomiting" },
    { id: "worsening_headache", label: "Headache getting worse" },
    { id: "unequal_pupils", label: "Pupils look unequal" },
    { id: "cannot_stay_awake", label: "Can't wake up / stay awake" },
    { id: "weakness_numbness", label: "Weakness or numbness" },
    { id: "worsening_confusion", label: "Getting more confused" },
    { id: "unusual_behavior", label: "Acting unusually" },
    { id: "neck_pain", label: "Neck pain" },
  ],
  "heat:context": [
    { id: "heat_exposure", label: "Been in the heat / hot environment" },
    { id: "outdoor_activity", label: "Outdoors in the sun" },
    { id: "exertion", label: "Exercising / exerting" },
    { id: "hot_environment", label: "Hot room or workplace" },
    { id: "sweating_heavily", label: "Sweating heavily" },
    { id: "not_sweating", label: "NOT sweating despite the heat" },
    { id: "dizziness", label: "Dizzy or lightheaded" },
    { id: "nausea_vomiting", label: "Nausea or vomiting" },
    { id: "collapse_fainting", label: "Collapsed or fainted" },
    { id: "seizure", label: "Had a seizure" },
    { id: "body_temp", label: "Body temperature (°C or °F, if known)", numeric: true },
  ],
  "respiratory:redflags": [
    { id: "not_breathing_normally", label: "Not breathing normally" },
    { id: "unconscious", label: "Unconscious / unresponsive" },
    { id: "gasping", label: "Gasping for air" },
    { id: "choking", label: "Choking concern" },
    { id: "chest_pain", label: "Chest pain" },
    { id: "blue_lips", label: "Blue lips or face" },
    { id: "confusion", label: "Confused" },
    { id: "asthma_allergic", label: "Asthma / allergic reaction" },
    { id: "dizziness", label: "Dizzy" },
  ],
  "stroke:face": [
    { id: "sudden_onset", label: "Symptoms started suddenly" },
  ],
  "general:vitals": [
    { id: "is_responsive", label: "Person is awake and responsive", defaultOn: true },
    { id: "breathing_ok", label: "Breathing looks normal", defaultOn: true },
    { id: "head_injury", label: "There was a head injury" },
    { id: "movement_concern", label: "Concern about tremor / movement" },
  ],
  "general:context": [
    { id: "heat_exposure", label: "Heat exposure / overheating" },
    { id: "head_injury", label: "Head injury" },
    { id: "seizure", label: "Seizure" },
    { id: "repeated_vomiting", label: "Repeated vomiting" },
    { id: "confusion", label: "Confusion" },
    { id: "collapse_fainting", label: "Collapsed / fainted" },
  ],
};

/** Map raw checklist values to the UserInputs keys detectors expect.
 *  Most are identity; a couple are inverted safety affirmatives. */
export function mapInputs(
  key: string,
  raw: Record<string, boolean | number | string>,
): Record<string, boolean | number | string> {
  const out = { ...raw };
  if (key === "general:vitals") {
    out.conscious = raw.is_responsive !== false;
    out.breathing_normally = raw.breathing_ok !== false;
  }
  return out;
}
