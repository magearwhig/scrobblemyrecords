import express, { Request, Response } from 'express';

import { ScrobbleTrack, ScrobbleSession, Track } from '../../shared/types';
import { AuthService } from '../services/authService';
import { LastFmService } from '../services/lastfmService';
import { FileStorage } from '../utils/fileStorage';
import { validateSessionId } from '../utils/validation';

// Create router factory function for dependency injection
export default function createScrobbleRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  lastfmService: LastFmService
) {
  const router = express.Router();

  // Scrobble a single track
  router.post('/track', async (req: Request, res: Response) => {
    try {
      const track: ScrobbleTrack = req.body;

      // Validate required fields
      if (!track.artist || !track.track) {
        return res.status(400).json({
          success: false,
          error: 'Artist and track are required',
        });
      }

      // Set timestamp if not provided
      if (!track.timestamp) {
        track.timestamp = Math.floor(Date.now() / 1000);
      }

      await lastfmService.scrobbleTrack(track);

      res.json({
        success: true,
        data: {
          message: 'Track scrobbled successfully',
          track,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Scrobbling failed',
      });
    }
  });

  // Scrobble multiple tracks
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { tracks, baseTimestamp } = req.body;

      if (!Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Tracks array is required and must not be empty',
        });
      }

      // Validate tracks
      for (const track of tracks) {
        if (!track.artist || !track.track) {
          return res.status(400).json({
            success: false,
            error: 'All tracks must have artist and track fields',
          });
        }
      }

      // Check authentication after validation
      const testResult = await lastfmService.testConnection();
      if (!testResult.success) {
        return res.status(500).json({
          success: false,
          error: testResult.message,
        });
      }

      // Set timestamps for tracks
      const currentTime = baseTimestamp || Math.floor(Date.now() / 1000);
      const tracksWithTimestamps = tracks.map((track, index) => ({
        ...track,
        timestamp:
          track.timestamp || currentTime - (tracks.length - index - 1) * 180, // 3 minutes apart
      }));

      const results = await lastfmService.scrobbleBatch(tracksWithTimestamps);

      res.json({
        success: true,
        data: {
          message: `Scrobbled ${results.success} tracks successfully`,
          results,
          tracks: tracksWithTimestamps,
          sessionId: results.sessionId,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Batch scrobbling failed',
      });
    }
  });

  // Get scrobble history
  router.get('/history', async (req: Request, res: Response) => {
    try {
      // Check authentication first by testing connection
      const testResult = await lastfmService.testConnection();
      if (!testResult.success) {
        return res.status(500).json({
          success: false,
          error: testResult.message,
        });
      }

      const sessions = await lastfmService.getScrobbleHistory();

      res.json({
        success: true,
        data: sessions || [],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get scrobble history',
      });
    }
  });

  // Get specific scrobble session
  router.get('/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      // Validate sessionId format to prevent path traversal
      if (!validateSessionId(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format',
        });
      }

      const session = await fileStorage.readJSON(
        `scrobbles/session-${sessionId}.json`
      );

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session',
      });
    }
  });

  // Prepare tracks for scrobbling from release
  router.post('/prepare-from-release', async (req: Request, res: Response) => {
    try {
      const { release, selectedTracks, startTime } = req.body;

      if (!release || !release.tracklist) {
        return res.status(400).json({
          success: false,
          error: 'Release with tracklist is required',
        });
      }

      // Filter tracks if specific tracks are selected
      const tracksToScrobble =
        selectedTracks && selectedTracks.length > 0
          ? release.tracklist.filter((track: Track, index: number) =>
              selectedTracks.includes(index)
            )
          : release.tracklist;

      // Parse start time (expecting Unix timestamp in seconds)
      const startTimestamp = startTime
        ? parseInt(startTime)
        : Math.floor(Date.now() / 1000);

      // Calculate timestamps based on track durations
      let currentTime = startTimestamp;
      const scrobbleTracks: ScrobbleTrack[] = tracksToScrobble.map(
        (track: Track) => {
          const trackDuration = track.duration
            ? parseTrackDuration(track.duration)
            : 180; // Default 3 minutes

          const scrobbleTrack: ScrobbleTrack = {
            artist: track.artist || release.artist,
            track: track.title,
            album: release.title,
            timestamp: currentTime,
            duration: trackDuration,
          };

          // Move to next track time (add duration + 1 second gap)
          currentTime += trackDuration + 1;

          return scrobbleTrack;
        }
      );

      res.json({
        success: true,
        data: {
          tracks: scrobbleTracks,
          release: {
            title: release.title,
            artist: release.artist,
            year: release.year,
          },
          startTime: startTimestamp,
          totalDuration: currentTime - startTimestamp,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to prepare tracks',
      });
    }
  });

  // Helper function to parse track duration from Discogs format (e.g., "3:45")
  function parseTrackDuration(duration: string): number {
    if (typeof duration === 'number') {
      return duration;
    }

    if (typeof duration === 'string') {
      const parts = duration.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]);
        const seconds = parseInt(parts[1]);
        return minutes * 60 + seconds;
      }
    }

    // Default to 3 minutes if parsing fails
    return 180;
  }

  // Get scrobble progress for a session
  router.get('/progress/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const session = await fileStorage.readJSON<ScrobbleSession>(
        `scrobbles/session-${sessionId}.json`
      );

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          status: session.status,
          progress: session.progress,
          error: session.error,
        },
      });
    } catch (error) {
      // Check if it's a file not found error
      if (error instanceof Error && error.message.includes('File not found')) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get progress',
      });
    }
  });

  return router;
}
