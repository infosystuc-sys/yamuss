
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeDiscrepancy(taxType: string, applied: number, actual: number) {
  try {
    const prompt = `Analyze a tax retention discrepancy in a finance system. 
    Tax Type: ${taxType}
    Applied Rate in system: ${applied}%
    Actual Rate from official tax board: ${actual}%
    Provide a short, 2-sentence explanation of the financial risk and a suggested action.`;

    // Fix: When using maxOutputTokens with Gemini 3 series models, a thinkingBudget should be specified to ensure reasoning doesn't consume all tokens.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 200,
        thinkingConfig: { thinkingBudget: 50 },
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "No se pudo generar el análisis automático de la discrepancia.";
  }
}
