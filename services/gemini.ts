import { GoogleGenAI } from "@google/genai";

export interface SafetyAlert {
  title: string;
  source: string;
  url: string;
  summary: string;
}

export const getSafetyAlerts = async (): Promise<SafetyAlert[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Validación suave: Si no hay key, deshabilitar AI silenciosamente
  if (!apiKey) {
    console.warn('Gemini AI is disabled: No API Key found');
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash';
    const prompt = "Find 3 recent construction safety news or alerts related to underground service strikes, excavation hazards, or roadworks safety in New Zealand or Australia from the last year. Return a list.";

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    // Parse the chunks to extract structured data manually since we can't force JSON easily with Search tool
    // We will map the grounding chunks directly to our alert format

    if (!chunks || chunks.length === 0) {
      return [{
        title: "General Safety Reminder",
        source: "Eastern Busway Alliance",
        url: "#",
        summary: "Always check BeforeUDig plans before excavation."
      }];
    }

    const alerts: SafetyAlert[] = chunks
      .filter(chunk => chunk.web?.uri && chunk.web?.title)
      .slice(0, 3)
      .map(chunk => ({
        title: chunk.web!.title!,
        url: chunk.web!.uri!,
        source: new URL(chunk.web!.uri!).hostname,
        summary: "Click to read full safety alert from source."
      }));

    return alerts;

  } catch (error) {
    console.error("Gemini API Error (Non-fatal, ignoring):", error);
    return [];
  }
};