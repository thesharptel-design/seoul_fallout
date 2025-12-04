import { GoogleGenAI } from "@google/genai";
import type { Chat } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });
  }

  async validateConnection(): Promise<boolean> {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Retry logic for transient errors (like 429/503)
    for (let i = 0; i < 2; i++) {
        try {
            const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: "Hello", 
            });
            return !!response.text;
        } catch (error: any) {
            console.error(`Connection attempt ${i + 1} failed:`, error);
            
            // If it's the last attempt, throw formatted error
            if (i === 1) {
                let msg = error.message || "Unknown error";
                if (msg.includes('401')) msg = "API 키가 유효하지 않습니다.";
                else if (msg.includes('403')) msg = "API 키 권한이 없습니다.";
                else if (msg.includes('429')) msg = "요청 횟수 초과 (잠시 후 다시 시도하세요).";
                else if (msg.includes('503')) msg = "서버 혼잡 (잠시 후 다시 시도하세요).";
                
                throw new Error(msg);
            }
            // Wait 2s before retry
            await delay(2000);
        }
    }
    return false;
  }

  async sendMessage(message: string): Promise<string> {
    try {
      const result = await this.chat.sendMessage({ message });
      return result.text || "";
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  }

  async startGame(selectedJob: string, selectedPerk: string | null): Promise<string> {
    try {
        let mode = "Zero Hour (No Perks, Fresh Start)";
        let perkInstructions = "";

        if (selectedPerk) {
            mode = `Legacy Mode (Apply Perk: ${selectedPerk})`;
            perkInstructions = `
5. LEGACY PERK ACTIVATION:
   - The player starts with the perk: '${selectedPerk}'.
   - You MUST add '${selectedPerk}' to the [Tags] list in the HUD.
   - IMPORTANT: If '${selectedPerk}' is an item, weapon, or tool, you MUST ALSO add it to the [장비] (Equipment) field in the HUD.
   - Explicitly mention this item/perk in the opening narrative.`;
        }

        const prompt = `[SYSTEM] GAME START SEQUENCE INITIATED.
        
SELECTED MODE: ${mode}
SELECTED CLASS: ${selectedJob}

INSTRUCTION: 
1. Do NOT display character selection menu.
2. Do NOT ask about Zero Hour or Perks.
3. Start the narrative immediately at 'Situation 1'.
4. Apply the traits of the '${selectedJob}' class to the starting inventory and stats.
${perkInstructions}
6. Generate the first scene now.`;

        const result = await this.chat.sendMessage({ message: prompt });
        return result.text || "";
    } catch (error) {
        console.error("Failed to start game:", error);
        throw error;
    }
  }
}