import { ParsedResponse, GameState } from "../types";

export const parseGameResponse = (text: string): ParsedResponse => {
  // 1. Extract HUD Code Block
  // The system prompt defines the HUD inside a ```text ... ``` block.
  const codeBlockRegex = /```text([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);

  let hudRaw: string | null = null;
  let narrative = text;

  if (match) {
    hudRaw = match[1].trim();
    // Remove the HUD from the narrative to avoid duplication, or keep it depending on UX.
    // We will remove it to render it in the sidebar.
    narrative = text.replace(match[0], '').trim();
  }

  // 2. Extract Choices (Simple heuristic based on "1. ", "2. ")
  // This is for creating clickable buttons.
  const choiceRegex = /^(\d+)\.\s+(.*)$/gm;
  const choices: string[] = [];
  let choiceMatch;
  while ((choiceMatch = choiceRegex.exec(narrative)) !== null) {
    // We don't remove choices from narrative, just extract for buttons
    // Actually, we keep them in text for context, but adding buttons is nice.
    if (choiceMatch[1] !== '0') { // 0 is usually free action
        choices.push(choiceMatch[0]);
    }
  }

  return {
    narrative,
    choices,
    hudRaw
  };
};

export const parseHudToState = (hudText: string): Partial<GameState> => {
  const state: Partial<GameState> = {};

  const lines = hudText.split('\n');
  lines.forEach(line => {
    if (line.includes('[상태]')) {
        state.hp = line.replace('[상태]', '').trim();
    }
    if (line.includes('[스탯]')) {
        state.stats = line.replace('[스탯]', '').trim();
    }
    if (line.includes('[태그]')) {
        const tagsRaw = line.replace('[태그]', '').trim();
        state.tags = tagsRaw.split(',').map(t => t.trim());
    }
    if (line.includes('[장비]')) {
        state.equipment = line.replace('[장비]', '').trim();
    }
    if (line.includes('[메모]')) {
        state.notes = line.replace('[메모]', '').trim();
    }
  });

  return state;
};

// Simple XOR cipher for "encryption" (obfuscation) as requested
// Real encryption requires more libs, this is just to prevent plain text read in localStorage
export const encryptKey = (key: string): string => {
    const secret = "SEOUL_FALLOUT_SECRET";
    return btoa(key.split('').map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))
    ).join(''));
};

export const decryptKey = (cipher: string): string => {
    const secret = "SEOUL_FALLOUT_SECRET";
    try {
        return atob(cipher).split('').map((char, i) => 
            String.fromCharCode(char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))
        ).join('');
    } catch (e) {
        return "";
    }
};