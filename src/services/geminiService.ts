import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

/**
 * Fetches the Gemini API key from the specified URL.
 * Falls back to process.env.GEMINI_API_KEY if the fetch fails.
 */
export async function fetchGeminiApiKey(): Promise<string> {
  try {
    const response = await fetch('https://webapi.tyzenr.com/keys/gemini');
    if (!response.ok) {
      throw new Error(`Failed to fetch Gemini API key: ${response.statusText}`);
    }
    
    // Try to parse as JSON first, then fallback to text
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data.key || data.apiKey || text;
    } catch {
      return text.trim();
    }
  } catch (error) {
    console.error('Error fetching Gemini API key from URL:', error);
    return process.env.GEMINI_API_KEY || '';
  }
}

/**
 * Returns an initialized GoogleGenAI instance.
 * Fetches the API key on the first call.
 */
export async function getGenAIInstance(): Promise<GoogleGenAI> {
  if (!genAI) {
    const apiKey = await fetchGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not found. Please ensure it is provided via URL or environment variable.');
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}
