import { CollectionItem, SuggestionResult } from '../../shared/types';

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
 * Builds prompts for AI-powered music suggestions
 */
export class AIPromptBuilder {
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
   * Build the system prompt that sets up the AI's role
   */
  static buildSystemPrompt(): string {
    return `You are a knowledgeable music recommendation assistant helping a vinyl record collector decide what to listen to from their personal collection.

Your role is to suggest albums they already own, based on:
1. The current time of day and mood it typically brings
2. Their listening history and preferences
3. Albums they haven't played in a while
4. Creative connections between artists and genres

Guidelines:
- Only suggest albums that are in their collection
- Explain your reasoning in a conversational, music-lover way
- Consider the context (morning coffee, late night, weekend, etc.)
- Be specific about why THIS album fits THIS moment
- If they mention a mood, prioritize that over other factors

Format your response as JSON with this structure:
{
  "suggestion": {
    "artist": "Artist Name",
    "album": "Album Title",
    "reasoning": "Your 2-3 sentence explanation"
  },
  "alternatives": [
    {
      "artist": "Artist Name",
      "album": "Album Title",
      "reasoning": "Brief explanation"
    }
  ]
}`;
  }

  /**
   * Build the user prompt with context
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

    // Collection summary
    parts.push(`\nMy vinyl collection has ${context.collectionSize} albums.`);

    // Format breakdown
    if (Object.keys(context.formatBreakdown).length > 0) {
      const formats = Object.entries(context.formatBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([format, count]) => `${count} ${format}`)
        .join(', ');
      parts.push(`Formats: ${formats}.`);
    }

    // Decade breakdown
    if (Object.keys(context.decadeBreakdown).length > 0) {
      const decades = Object.entries(context.decadeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([decade, count]) => `${decade}s (${count})`)
        .join(', ');
      parts.push(`Eras: ${decades}.`);
    }

    // Top artists
    if (context.topArtists.length > 0) {
      const topArtistsStr = context.topArtists
        .slice(0, 5)
        .map(a => `${a.artist} (${a.playCount} plays)`)
        .join(', ');
      parts.push(`\nMy most-played artists: ${topArtistsStr}`);
    }

    // Recently played
    if (context.recentlyPlayed.length > 0) {
      parts.push(`\nRecently played (avoid these for variety):`);
      context.recentlyPlayed.slice(0, 5).forEach(album => {
        const daysAgo = Math.floor(
          (Date.now() - album.lastPlayed.getTime()) / (1000 * 60 * 60 * 24)
        );
        parts.push(
          `- ${album.artist} - ${album.album} (${daysAgo} days ago, ${album.playCount} plays)`
        );
      });
    }

    // Algorithm suggestions for comparison
    if (context.algorithmPicks && context.algorithmPicks.length > 0) {
      parts.push(
        `\nThe algorithm already suggested these (pick something different):`
      );
      context.algorithmPicks.slice(0, 3).forEach(pick => {
        parts.push(
          `- ${pick.album.release.artist} - ${pick.album.release.title}`
        );
      });
    }

    // Recent AI suggestions to avoid repeating
    if (context.recentAISuggestions && context.recentAISuggestions.length > 0) {
      parts.push(
        `\nIMPORTANT: You already suggested these in the last hour (do NOT suggest these again):`
      );
      context.recentAISuggestions.forEach(suggestion => {
        parts.push(`- ${suggestion.artist} - ${suggestion.album}`);
      });
    }

    parts.push(
      `\nBased on this context, what album should I pull from the shelf? Give me a thoughtful recommendation.`
    );

    return parts.join('\n');
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

      const parsed = JSON.parse(jsonMatch[0]);
      const suggestions: AISuggestion[] = [];

      // Process main suggestion
      if (parsed.suggestion) {
        const matched = this.findInCollection(
          parsed.suggestion.artist,
          parsed.suggestion.album,
          collection
        );
        suggestions.push({
          artist: parsed.suggestion.artist,
          album: parsed.suggestion.album,
          reasoning: parsed.suggestion.reasoning || 'No reasoning provided',
          confidence: matched ? 'high' : 'low',
          matchedAlbum: matched,
        });
      }

      // Process alternatives
      if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
        for (const alt of parsed.alternatives.slice(0, 2)) {
          const matched = this.findInCollection(
            alt.artist,
            alt.album,
            collection
          );
          suggestions.push({
            artist: alt.artist,
            album: alt.album,
            reasoning: alt.reasoning || 'No reasoning provided',
            confidence: matched ? 'medium' : 'low',
            matchedAlbum: matched,
          });
        }
      }

      return suggestions;
    } catch {
      // If JSON parsing fails, try to extract artist - album from text
      return this.parseTextResponse(response, collection);
    }
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
  private static findInCollection(
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
