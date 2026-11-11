export const RACERS = [
  { id: 'red', name: 'Turbo Red', color: '#ff3b4e', accent: '#ffffff', helmetColor: '#ffd166' },
  { id: 'sunny', name: 'Sunny Pop', color: '#ffb703', accent: '#fb5607', helmetColor: '#ffffff' },
  { id: 'aqua', name: 'Lagoon', color: '#00bbf9', accent: '#00f5d4', helmetColor: '#fff3b0' },
  { id: 'berry', name: 'Peach Berry', color: '#ff70a6', accent: '#ffd670', helmetColor: '#ffffff' },
  { id: 'kiwi', name: 'Kiwi Drift', color: '#52b788', accent: '#d8f3dc', helmetColor: '#ffd166' },
  { id: 'cosmic', name: 'Cosmic', color: '#8338ec', accent: '#3a86ff', helmetColor: '#ffbe0b' },
];

export const ITEMS = {
  NONE: null,
  TURBO: 'turbo',
  GREEN_SHELL: 'green_shell',
  RED_SHELL: 'red_shell',
  BLUE_SHELL: 'blue_shell',
  BANANA: 'banana',
  STAR: 'star',
  LIGHTNING: 'lightning',
};

export const TRACKS = [
  {
    id: 'coco',
    name: 'Île Coco',
    subtitle: 'Lagon Tropical',
    accent: '#00bbf9',
    icon: '🌴',
    difficulty: 'Accessible',
  },
  {
    id: 'neon',
    name: 'Néon Drift',
    subtitle: 'Cyber Tokyo',
    accent: '#f72585',
    icon: '🌃',
    difficulty: 'Technique',
  },
  {
    id: 'rainbow',
    name: 'Route Céleste',
    subtitle: 'Arc-en-Ciel Cosmique',
    accent: '#ffbe0b',
    icon: '🌈',
    difficulty: 'Vertige !',
  },
];

export const EMOTES = [
  { id: 'fire', icon: '🔥', label: 'En feu' },
  { id: 'devil', icon: '😈', label: 'Cheh !' },
  { id: 'laugh', icon: '😂', label: 'MDR' },
  { id: 'horn', icon: '📯', label: 'Klaxon' },
];

export const RACE_CONFIG = {
  TOTAL_LAPS: 3,
  MAX_PLAYERS: 6,
  KART_MAX_SPEED: 42,
  BOOST_SPEED: 58,
  ROAD_HALF_WIDTH: 7.5,
};
