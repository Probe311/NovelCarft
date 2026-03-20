/**
 * Presets de profil d'écriture : appliquent registre, POV, rythme, ton, style et auteurs.
 */
export interface WritingPreset {
  id: string;
  name: string;
  register: string;
  pov: string;
  rhythm: string;
  tone: string;
  style: string;
  authors: string[];
}

export const WRITING_PRESETS: WritingPreset[] = [
  {
    id: 'litteraire',
    name: 'Littéraire',
    register: 'Littéraire',
    pov: '3e personne limité ou omniscient',
    rhythm: 'Phrases travaillées, mélange de courtes et longues, descriptions riches',
    tone: 'Lyrique, contemplatif',
    style: 'Langue soignée, métaphores, attention au rythme des phrases et aux sonorités.',
    authors: ['Le Clézio', 'Modiano', 'Yourcenar'],
  },
  {
    id: 'thriller',
    name: 'Thriller',
    register: 'Thriller / Polar',
    pov: '1re personne ou 3e limité',
    rhythm: 'Phrases courtes, chapitres courts, tension constante, beaucoup de dialogue',
    tone: 'Sombre, tendu, cynique',
    style: 'Rythmé, percutant. Suspense et rebondissements. Dialogues secs.',
    authors: ['Harlan Coben', 'Gillian Flynn', 'Joël Dicker'],
  },
  {
    id: 'fantasy',
    name: 'Fantasy épique',
    register: 'SFFF — Fantasy',
    pov: '3e personne omniscient ou limité multi-POV',
    rhythm: 'Alternance scènes d\'action et moments de respiration, descriptions du monde',
    tone: 'Épique, parfois sombre, lueur d\'espoir',
    style: 'Immersif, world-building détaillé, quête et personnages mémorables.',
    authors: ['Brandon Sanderson', 'Robin Hobb', 'Patrick Rothfuss'],
  },
  {
    id: 'romance',
    name: 'Romance',
    register: 'Romance',
    pov: '1re personne ou 3e limité (souvent double POV)',
    rhythm: 'Équilibre dialogue / introspection, scènes émotionnelles marquées',
    tone: 'Chaleureux, émotionnel, parfois drôle',
    style: 'Focus sur les émotions et la relation, tension romantique, happy end ou émotionnellement satisfaisant.',
    authors: ['Christina Lauren', 'Emily Henry', 'Mhairi McFarlane'],
  },
  {
    id: 'sf',
    name: 'Science-fiction',
    register: 'SFFF — Science-fiction',
    pov: '3e limité ou 1re personne',
    rhythm: 'Variable : idées et ambiance autant que l\'action',
    tone: 'Souvent froid, critique ou contemplatif',
    style: 'Concepts et cohérence du monde, personnages au service de l\'idée ou inversement.',
    authors: ['Asimov', 'Philip K. Dick', 'Ursula K. Le Guin'],
  },
  {
    id: 'noir',
    name: 'Noir / Urbain',
    register: 'Noir',
    pov: '1re personne (détective ou anti-héros)',
    rhythm: 'Phrases courtes, punch, dialogues cinglants',
    tone: 'Cynique, sombre, désenchanté',
    style: 'Atmosphère urbaine, morale ambiguë, fin souvent amère.',
    authors: ['Chandler', 'James Ellroy', 'Jean-Patrick Manchette'],
  },
];

export function getPresetById(id: string): WritingPreset | undefined {
  return WRITING_PRESETS.find((p) => p.id === id);
}
