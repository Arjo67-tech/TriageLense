import type { ExamConfig, ModuleId } from "./types";

export const SPEECH_PHRASE = "The early bird catches the worm";
export const SENTENCE_PHRASE = "I can speak this full sentence without stopping";

export const EXAMS: Record<ModuleId, ExamConfig> = {
  stroke: {
    module: "stroke",
    title: "Stroke (FAST)",
    blurb: "Face droop, arm drift and speech — the classic FAST screen, scored live from camera + mic.",
    steps: [
      { id: "face", kind: "face", title: "Face — smile", durationSec: 8,
        instruction: "Look at the camera and smile widely, showing your teeth. Hold the smile." },
      { id: "arms", kind: "pose", title: "Arms — hold out", durationSec: 10,
        instruction: "Raise both arms straight out in front of you, palms up, and hold them as still as you can." },
      { id: "speech", kind: "speech", title: "Speech — repeat phrase", prompt: SPEECH_PHRASE,
        instruction: "Say the phrase out loud, clearly, in one go." },
    ],
  },
  parkinsons: {
    module: "parkinsons",
    title: "Parkinsonian movement",
    blurb: "Finger-tapping rhythm/amplitude and postural tremor, measured with MediaPipe Hands.",
    steps: [
      { id: "tap-right", kind: "hands", title: "Finger tap — right hand", durationSec: 12,
        instruction: "Hold your RIGHT hand up to the camera. Tap thumb and index finger together as big and fast as you can." },
      { id: "tap-left", kind: "hands", title: "Finger tap — left hand", durationSec: 12,
        instruction: "Now your LEFT hand. Tap thumb and index finger together as big and fast as you can." },
      { id: "tremor", kind: "hands", title: "Hold still — tremor", durationSec: 10,
        instruction: "Hold both hands out toward the camera, fingers spread, and keep them as still as possible." },
    ],
  },
  concussion: {
    module: "concussion",
    title: "Concussion / head injury",
    blurb: "Danger-sign checklist plus live orientation, speech, balance-sway and eye-tracking.",
    steps: [
      { id: "danger", kind: "questions", title: "Danger signs", instruction: "Check anything that has happened since the injury." },
      { id: "orientation", kind: "questions", title: "Orientation", instruction: "Answer these as quickly and accurately as you can." },
      { id: "speech", kind: "speech", title: "Speech", prompt: SPEECH_PHRASE,
        instruction: "Say the phrase out loud, clearly, in one go." },
      { id: "balance", kind: "pose", title: "Balance — stand still", durationSec: 12,
        instruction: "Stand so your head, shoulders and hips are visible. Feet together, arms at sides, hold still." },
      { id: "eyes", kind: "eye-tracking", title: "Eye tracking", durationSec: 12,
        instruction: "Keep your head still and follow the moving dot with your eyes only." },
    ],
  },
  heat: {
    module: "heat",
    title: "Heat illness",
    blurb: "Exposure/symptom context combined with live confusion, speech and steadiness checks.",
    steps: [
      { id: "context", kind: "questions", title: "Exposure & symptoms", instruction: "Tell us about the heat exposure and how you feel." },
      { id: "orientation", kind: "questions", title: "Orientation", instruction: "Answer these as quickly and accurately as you can." },
      { id: "speech", kind: "speech", title: "Speech", prompt: SPEECH_PHRASE,
        instruction: "Say the phrase out loud, clearly, in one go." },
      { id: "steady", kind: "pose", title: "Steadiness", durationSec: 10,
        instruction: "Stand or sit upright, visible from the waist up, and hold still." },
    ],
  },
  respiratory: {
    module: "respiratory",
    title: "Respiratory distress",
    blurb: "Breathing-rate from chest/shoulder motion, full-sentence test, and tripod-posture detection.",
    steps: [
      { id: "redflags", kind: "questions", title: "Red flags", instruction: "Check anything that applies right now." },
      { id: "breathing", kind: "breathing", title: "Breathing rate", durationSec: 30,
        instruction: "Sit still, facing the camera, shoulders visible. Breathe normally — do not exaggerate." },
      { id: "sentence", kind: "speech", title: "Full sentence", prompt: SENTENCE_PHRASE,
        instruction: "Say the whole sentence in one breath, without stopping." },
      { id: "posture", kind: "pose", title: "Posture", durationSec: 8,
        instruction: "Sit naturally, visible from the hips up. Don't force your posture." },
    ],
  },
  general: {
    module: "general",
    title: "General triage",
    blurb: "Runs mini versions of the real detectors to route you to the right module.",
    steps: [
      { id: "vitals", kind: "questions", title: "Conscious & breathing", instruction: "Quick safety check first." },
      { id: "face", kind: "face", title: "Smile (stroke mini)", durationSec: 6,
        instruction: "Smile widely at the camera and hold." },
      { id: "arms", kind: "pose", title: "Arm raise (stroke mini)", durationSec: 8,
        instruction: "Hold both arms out in front, palms up, and hold still." },
      { id: "speech", kind: "speech", title: "Speech phrase", prompt: SPEECH_PHRASE,
        instruction: "Say the phrase out loud, clearly." },
      { id: "breathing", kind: "breathing", title: "Breathing observation", durationSec: 20,
        instruction: "Sit still, shoulders visible, breathe normally." },
      { id: "sentence", kind: "speech", title: "Full sentence", prompt: SENTENCE_PHRASE,
        instruction: "Say the whole sentence in one breath." },
      { id: "context", kind: "questions", title: "Heat / head injury", instruction: "A few context questions." },
    ],
  },
};

export const MODULE_ORDER: ModuleId[] = [
  "general",
  "stroke",
  "parkinsons",
  "concussion",
  "heat",
  "respiratory",
];
