import { getGenAI, recordGeminiCall } from "../gemini/client";

export interface GroundedSearchResult {
  groundedText: string;
  searchQueries: string[];
  webSources: { uri: string; title: string }[];
  modelUsed: string;
}

/**
 * Stage 1 of Two-Stage Grounding:
 * Performs real-time Google Search grounding using Gemini to extract up-to-date
 * architectural details, documentation, entities, and verified web citations.
 */
export async function performSearchGroundedSynthesis(
  query: string,
  userHint?: string,
  timeoutMs = 15000
): Promise<GroundedSearchResult | null> {
  const ai = getGenAI();
  if (!ai || !query || query.trim().length === 0) return null;

  const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest"];
  const prompt = `Perform a live web search to gather authoritative, up-to-date facts, official documentation, architectural context, repository URLs, and technical specifications for the following user topic or inquiry:
"""
${query}
"""
${userHint ? `Additional Context/Intent: ${userHint}` : ""}

Provide a rich, factual, and detailed technical brief with key entities, features, installation patterns, and verified source references.`;

  for (const model of candidateModels) {
    const startMs = Date.now();
    try {
      const generatePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);
      const latencyMs = Date.now() - startMs;
      const text = response?.text || "";

      if (text.trim().length > 0) {
        const candidate = response.candidates?.[0];
        const groundingMeta = candidate?.groundingMetadata;

        const webSources: { uri: string; title: string }[] = [];
        if (groundingMeta?.groundingChunks && Array.isArray(groundingMeta.groundingChunks)) {
          for (const chunk of groundingMeta.groundingChunks) {
            if (chunk.web?.uri) {
              webSources.push({
                uri: chunk.web.uri,
                title: chunk.web.title || chunk.web.uri,
              });
            }
          }
        }

        const searchQueries: string[] = groundingMeta?.webSearchQueries || [];

        recordGeminiCall({
          endpoint: "search-grounding",
          model,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });

        return {
          groundedText: text.trim(),
          searchQueries,
          webSources,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      console.warn(`[SearchGrounding] ${model} search failed:`, err?.message || err);
      recordGeminiCall({
        endpoint: "search-grounding",
        model,
        latencyMs,
        status: "error",
        statusCode: 500,
        errorMessage: err?.message,
      });
    }
  }

  return null;
}
