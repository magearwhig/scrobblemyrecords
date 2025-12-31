import { CollectionItem, SuggestionResult } from '../../shared/types';

/**
 * Candidate album for AI selection (ID-based for reliable matching)
 */
export interface CandidateAlbum {
  id: number;
  artist: string;
  title: string;
  year?: number;
  reason?: string; // Why it's a candidate (from algorithm)
}

/**
 * Context data for building AI prompts
 */
export interface AIPromptContext {
  // Current time info
  currentTime: Date;
  dayOfWeek: string;
  timeOfDay: string; // morning, afternoon, evening, night

  // Listening history
  recentlyPlayed: Array<{
    artist: string;
    album: string;
    playCount: number;
    lastPlayed: Date;
  }>;
  topArtists: Array<{ artist: string; playCount: number }>;

  // Collection - the actual albums the user owns
  collection: CollectionItem[];

  // Collection summary
  collectionSize: number;
  formatBreakdown: Record<string, number>;
  decadeBreakdown: Record<string, number>;

  // Algorithm suggestions (for comparison)
  algorithmPicks?: SuggestionResult[];

  // Recent AI suggestions to avoid (within the last hour)
  recentAISuggestions?: Array<{ artist: string; album: string }>;

  // User request (optional mood or preference)
  userRequest?: string;
}

/**
 * AI suggestion response format
 */
export interface AISuggestion {
  artist: string;
  album: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  matchedAlbum?: CollectionItem; // If we can match it to collection
}

/**
 * Parsed AI response structure (matches the JSON output format)
 */
interface AIResponseJSON {
  suggestion: {
    id: number;
    reasoning: string;
  };
  alternatives?: Array<{
    id: number;
    reasoning: string;
  }>;
  error?: string;
}

/**
 * Builds prompts for AI-powered music suggestions
 */
export class AIPromptBuilder {
  /**
   * Maximum number of candidates to show in the prompt
   */
  private static readonly MAX_CANDIDATES = 50;

  /**
   * Get time of day category
   */
  static getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Get day of week name
   */
  static getDayOfWeek(date: Date): string {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return days[date.getDay()];
  }

  /**
   * Build candidates from algorithm picks or fallback to collection sample
   */
  static buildCandidates(context: AIPromptContext): CandidateAlbum[] {
    const candidates: CandidateAlbum[] = [];
    const seenIds = new Set<number>();

    // First, add algorithm picks (these are pre-scored and relevant)
    if (context.algorithmPicks && context.algorithmPicks.length > 0) {
      for (const pick of context.algorithmPicks) {
        if (!seenIds.has(pick.album.id)) {
          candidates.push({
            id: pick.album.id,
            artist: pick.album.release.artist,
            title: pick.album.release.title,
            year: pick.album.release.year,
            reason: pick.reason,
          });
          seenIds.add(pick.album.id);
        }
      }
    }

    // If we need more candidates, add from collection
    if (candidates.length < this.MAX_CANDIDATES) {
      const remaining = this.MAX_CANDIDATES - candidates.length;
      const shuffled = this.shuffleArray(
        context.collection.filter(item => !seenIds.has(item.id))
      );
      for (const item of shuffled.slice(0, remaining)) {
        candidates.push({
          id: item.id,
          artist: item.release.artist,
          title: item.release.title,
          year: item.release.year,
        });
      }
    }

    return candidates;
  }

  /**
   * Build the system prompt that sets up the AI's role
   * Includes few-shot examples for format compliance
   */
  static buildSystemPrompt(): string {
    return `You are a knowledgeable music recommendation assistant helping a vinyl record collector decide what to listen to.

CRITICAL RULES:
1. You will be given a numbered list of CANDIDATE albums with IDs
2. You MUST select albums ONLY by their numeric ID from the CANDIDATES list
3. Return ONLY valid JSON - no markdown, no commentary before or after
4. If you cannot comply, return: {"error": "reason"}

Your role is to pick albums based on:
- The current time of day and mood it typically brings
- The user's listening history and preferences
- Creative connections between artists and genres
- Avoiding recently played albums for variety

RESPONSE FORMAT (return ONLY this JSON, nothing else):
{
  "suggestion": {
    "id": <number from CANDIDATES>,
    "reasoning": "Your 2-3 sentence explanation"
  },
  "alternatives": [
    {"id": <number from CANDIDATES>, "reasoning": "Brief explanation"},
    {"id": <number from CANDIDATES>, "reasoning": "Brief explanation"}
  ]
}

EXAMPLE 1:
Given candidates including [ID: 42, Artist: Radiohead, Title: Kid A] on a rainy evening:
{
  "suggestion": {
    "id": 42,
    "reasoning": "Kid A's atmospheric electronics are perfect for this rainy evening. The album's contemplative mood matches the weather beautifully."
  },
  "alternatives": [
    {"id": 18, "reasoning": "Another great option for introspective listening."},
    {"id": 55, "reasoning": "If you want something with more energy."}
  ]
}

EXAMPLE 2:
Given candidates on a Saturday morning:
{
  "suggestion": {
    "id": 103,
    "reasoning": "This upbeat classic is perfect for Saturday morning coffee. The bright production will start your weekend right."
  },
  "alternatives": [
    {"id": 67, "reasoning": "A mellow alternative if you prefer a slower start."}
  ]
}

Remember: Return ONLY the JSON object. No other text.`;
  }

  /**
   * Build the user prompt with context
   * Uses ID-based candidate selection for reliable matching
   */
  static buildUserPrompt(context: AIPromptContext): string {
    const parts: string[] = [];

    // Time context
    parts.push(
      `It's ${context.timeOfDay} on ${context.dayOfWeek} (${context.currentTime.toLocaleTimeString()}).`
    );

    // User request if any
    if (context.userRequest) {
      parts.push(`\nI'm looking for: ${context.userRequest}`);
    }

    // Build candidates (ID-based for reliable matching)
    const candidates = this.buildCandidates(context);

    // CANDIDATES - The AI must pick from these by ID
    parts.push(`\n=== CANDIDATES (${candidates.length} albums) ===`);
    parts.push(`Pick ONLY by ID number from this list:\n`);

    for (const candidate of candidates) {
      const yearStr = candidate.year ? ` (${candidate.year})` : '';
      const reasonStr = candidate.reason ? ` [${candidate.reason}]` : '';
      parts.push(
        `[ID: ${candidate.id}] ${candidate.artist} - ${candidate.title}${yearStr}${reasonStr}`
      );
    }

    parts.push(`\n=== END CANDIDATES ===\n`);

    // Top artists from listening history
    if (context.topArtists.length > 0) {
      const topArtistsStr = context.topArtists
        .slice(0, 5)
        .map(a => `${a.artist} (${a.playCount} plays)`)
        .join(', ');
      parts.push(`My most-played artists: ${topArtistsStr}`);
    }

    // Recently played (truly recent, to avoid)
    if (context.recentlyPlayed.length > 0) {
      parts.push(`\nRecently played (AVOID these for variety):`);
      context.recentlyPlayed.slice(0, 5).forEach(album => {
        const daysAgo = Math.floor(
          (Date.now() - album.lastPlayed.getTime()) / (1000 * 60 * 60 * 24)
        );
        parts.push(`- ${album.artist} - ${album.album} (${daysAgo} days ago)`);
      });
    }

    // Recent AI suggestions to avoid repeating
    if (context.recentAISuggestions && context.recentAISuggestions.length > 0) {
      parts.push(
        `\nIMPORTANT: You already suggested these in the last hour (do NOT suggest again):`
      );
      context.recentAISuggestions.forEach(suggestion => {
        parts.push(`- ${suggestion.artist} - ${suggestion.album}`);
      });
    }

    // Algorithm picks summary (if available)
    if (context.algorithmPicks && context.algorithmPicks.length > 0) {
      parts.push(
        `\nNote: Albums marked with [reason] are top picks from my scoring algorithm. Consider these, but feel free to suggest something different if you have a compelling reason.`
      );
    }

    parts.push(
      `\nBased on this context, which album should I play? Return ONLY the JSON response with your selection by ID.`
    );

    return parts.join('\n');
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Build a prompt for contextual suggestions (mood-based)
   */
  static buildMoodPrompt(context: AIPromptContext, mood: string): string {
    return this.buildUserPrompt({
      ...context,
      userRequest: mood,
    });
  }

  /**
   * Parse AI response into structured suggestion
   * Supports both new ID-based format and legacy text format
   */
  static parseAIResponse(
    response: string,
    collection: CollectionItem[]
  ): AISuggestion[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed: AIResponseJSON = JSON.parse(jsonMatch[0]);
      const suggestions: AISuggestion[] = [];

      // Check for error response
      if (parsed.error) {
        return [];
      }

      // Build lookup map for quick ID matching
      const collectionById = new Map(collection.map(item => [item.id, item]));

      // Process main suggestion (ID-based)
      if (parsed.suggestion) {
        const matchedById = collectionById.get(parsed.suggestion.id);

        if (matchedById) {
          suggestions.push({
            artist: matchedById.release.artist,
            album: matchedById.release.title,
            reasoning: parsed.suggestion.reasoning || 'No reasoning provided',
            confidence: 'high',
            matchedAlbum: matchedById,
          });
        } else {
          // Fallback: try to find by fuzzy match if ID doesn't match
          // This handles legacy responses that might include artist/album fields
          const legacySuggestion = parsed.suggestion as unknown as {
            artist?: string;
            album?: string;
            reasoning?: string;
          };
          if (legacySuggestion.artist && legacySuggestion.album) {
            const matched = this.findInCollection(
              legacySuggestion.artist,
              legacySuggestion.album,
              collection
            );
            suggestions.push({
              artist: legacySuggestion.artist,
              album: legacySuggestion.album,
              reasoning: legacySuggestion.reasoning || 'No reasoning provided',
              confidence: matched ? 'high' : 'low',
              matchedAlbum: matched,
            });
          }
        }
      }

      // Process alternatives (ID-based)
      if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
        for (const alt of parsed.alternatives.slice(0, 2)) {
          const matchedById = collectionById.get(alt.id);

          if (matchedById) {
            suggestions.push({
              artist: matchedById.release.artist,
              album: matchedById.release.title,
              reasoning: alt.reasoning || 'No reasoning provided',
              confidence: 'medium',
              matchedAlbum: matchedById,
            });
          } else {
            // Legacy fallback
            const legacyAlt = alt as unknown as {
              artist?: string;
              album?: string;
              reasoning?: string;
            };
            if (legacyAlt.artist && legacyAlt.album) {
              const matched = this.findInCollection(
                legacyAlt.artist,
                legacyAlt.album,
                collection
              );
              if (matched) {
                suggestions.push({
                  artist: legacyAlt.artist,
                  album: legacyAlt.album,
                  reasoning: legacyAlt.reasoning || 'No reasoning provided',
                  confidence: 'medium',
                  matchedAlbum: matched,
                });
              }
            }
          }
        }
      }

      return suggestions;
    } catch {
      // If JSON parsing fails, try to extract artist - album from text
      return this.parseTextResponse(response, collection);
    }
  }

  /**
   * Validate a parsed response and return validation errors
   */
  static validateResponse(
    parsed: AIResponseJSON,
    candidateIds: Set<number>,
    avoidIds: Set<number>
  ): string[] {
    const errors: string[] = [];

    if (!parsed.suggestion) {
      errors.push('Missing "suggestion" field');
      return errors;
    }

    if (typeof parsed.suggestion.id !== 'number') {
      errors.push('suggestion.id must be a number');
    } else if (!candidateIds.has(parsed.suggestion.id)) {
      errors.push(
        `suggestion.id ${parsed.suggestion.id} is not in the CANDIDATES list`
      );
    } else if (avoidIds.has(parsed.suggestion.id)) {
      errors.push(`suggestion.id ${parsed.suggestion.id} is in the AVOID list`);
    }

    if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
      const usedIds = new Set([parsed.suggestion.id]);
      for (let i = 0; i < parsed.alternatives.length; i++) {
        const alt = parsed.alternatives[i];
        if (typeof alt.id !== 'number') {
          errors.push(`alternatives[${i}].id must be a number`);
        } else if (!candidateIds.has(alt.id)) {
          errors.push(
            `alternatives[${i}].id ${alt.id} is not in the CANDIDATES list`
          );
        } else if (usedIds.has(alt.id)) {
          errors.push(`alternatives[${i}].id ${alt.id} is a duplicate`);
        } else {
          usedIds.add(alt.id);
        }
      }
    }

    return errors;
  }

  /**
   * Fallback parser for non-JSON responses
   */
  private static parseTextResponse(
    response: string,
    collection: CollectionItem[]
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Look for patterns like "Artist - Album" or "Album by Artist"
    const patterns = [
      /["']([^"']+)["']\s+by\s+([^,.\n]+)/gi,
      /([^-]+)\s+-\s+([^,.\n]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        const [, first, second] = match;
        // Try both orderings
        let matched = this.findInCollection(
          second.trim(),
          first.trim(),
          collection
        );
        if (!matched) {
          matched = this.findInCollection(
            first.trim(),
            second.trim(),
            collection
          );
        }

        if (matched) {
          suggestions.push({
            artist: matched.release.artist,
            album: matched.release.title,
            reasoning: 'AI recommendation',
            confidence: 'medium',
            matchedAlbum: matched,
          });
        }

        if (suggestions.length >= 3) break;
      }
      if (suggestions.length >= 3) break;
    }

    return suggestions;
  }

  /**
   * Find an album in the collection with fuzzy matching
   */
  static findInCollection(
    artist: string,
    album: string,
    collection: CollectionItem[]
  ): CollectionItem | undefined {
    const normalizeString = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '');

    const normalizedArtist = normalizeString(artist);
    const normalizedAlbum = normalizeString(album);

    // Exact match first
    let match = collection.find(item => {
      const itemArtist = normalizeString(item.release.artist);
      const itemAlbum = normalizeString(item.release.title);
      return itemArtist === normalizedArtist && itemAlbum === normalizedAlbum;
    });

    if (match) return match;

    // Partial match
    match = collection.find(item => {
      const itemArtist = normalizeString(item.release.artist);
      const itemAlbum = normalizeString(item.release.title);
      return (
        (itemArtist.includes(normalizedArtist) ||
          normalizedArtist.includes(itemArtist)) &&
        (itemAlbum.includes(normalizedAlbum) ||
          normalizedAlbum.includes(itemAlbum))
      );
    });

    return match;
  }
}
