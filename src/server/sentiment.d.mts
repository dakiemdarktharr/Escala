import type { SentimentAnalysis } from "@/domain/contracts";
export function analyzeSentiment(text: string): Promise<SentimentAnalysis>;
