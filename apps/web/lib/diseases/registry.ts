/** Disease module registry — add Huntington's, myopathy, osteoarthritis here later. */
export interface DiseaseCard {
  id: string;
  title: string;
  blurb: string;
  href: string;
  available: boolean;
}

export const DISEASES: DiseaseCard[] = [
  {
    id: "parkinsons",
    title: "Parkinson's Disease",
    blurb: "Sustained vowel voice screening — record the patient saying 'aaah' and get a Parkinson's risk score in seconds. UCI-trained model, runs in-browser.",
    href: "/diagnose/parkinsons",
    available: true,
  },
  {
    id: "huntingtons",
    title: "Huntington's Disease",
    blurb: "Symptom-based risk screen using motor, cognitive, and psychiatric indicators + CAP genetic score. No audio or camera required.",
    href: "/diagnose/huntingtons",
    available: true,
  },
  {
    id: "myopathy",
    title: "Myopathy",
    blurb: "Coming soon.",
    href: "#",
    available: false,
  },
  {
    id: "osteoarthritis",
    title: "Osteoarthritis",
    blurb: "Coming soon.",
    href: "#",
    available: false,
  },
];
