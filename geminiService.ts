import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { MarketState, BotConfig } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeMarket = async (
  marketState: MarketState,
  botConfig: BotConfig,
  symbol: string
): Promise<string> => {
  try {
    const lastCandles = marketState.candles.slice(-10);
    
    // Calculate simple metrics for the prompt
    const avgPrice = lastCandles.reduce((acc, c) => acc + c.close, 0) / (lastCandles.length || 1);
    const volumeSum = lastCandles.reduce((acc, c) => acc + c.volume, 0);
    const trend = lastCandles.length > 0 && lastCandles[lastCandles.length - 1].close > lastCandles[0].close ? "UP" : "DOWN";

    const prompt = `
      You are an expert crypto market analyst assisting a Market Maker bot.
      The bot is paper-trading on the real-time **${symbol}** market (via LBank API).

      **Live Market Data:**
      - Current Price: $${marketState.currentPrice.toFixed(2)}
      - 24h Volume: ${marketState.volume24h.toLocaleString()}
      - Trend (Last 10m): ${trend}
      - Avg Price (Last 10m): $${avgPrice.toFixed(2)}
      - Volume Sum (Last 10m): ${volumeSum.toFixed(2)}

      **Bot Configuration:**
      - Spread: ${botConfig.spread}%
      - Price Offset: ${botConfig.priceOffset || 0}% (Skew)
      - Order Size: ${botConfig.orderSize}
      - Volatility Sensitivity: ${botConfig.volatility}

      **Instructions:**
      1. Analyze the current ${symbol} volume and price action.
      2. Advise if the current spread and price offset (skew) are appropriate.
      3. Recommend adjustments (e.g., "Shift price offset positive to capture uptrend" or "Widen spread").
      4. Keep the response concise (under 100 words), professional, and actionable.
      5. Format with Markdown.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Analysis unavailable.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating market analysis. Please check API Key configuration.";
  }
};