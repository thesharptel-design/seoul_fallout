export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GameState {
  hp: string;
  mental: string;
  stats: string;
  tags: string[];
  equipment: string;
  notes: string;
}

export interface ParsedResponse {
  narrative: string;
  choices: string[];
  hudRaw: string | null;
}

export enum GameStatus {
  IDLE,
  INITIALIZING,
  PLAYING,
  GAME_OVER
}
