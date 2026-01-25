import express, { Request, Response } from 'express';

import { ScrobbleTrack, ScrobbleSession, Track } from '../../shared/types';
import { artistMappingService } from '../services/artistMappingService';
import { AuthService } from '../services/authService';
import { LastFmService } from '../services/lastfmService';
import { ScrobbleHistorySyncService } from '../services/scrobbleHistorySyncService';
import { FileStorage } from '../utils/fileStorage';
import { validateSessionId } from '../utils/validation';

// Create router factory function for dependency injection
export default function createScrobbleRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  lastfmService: LastFmService,
  discogsService?: {
    searchCollection: (username: string, album: string) => Promise<any>;
  },
  scrobbleHistorySyncService?: ScrobbleHistorySyncService
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

      // Trigger incremental sync after successful scrobble
      if (scrobbleHistorySyncService) {
        // Fire and forget - don't wait for sync to complete
        scrobbleHistorySyncService
          .startIncrementalSync()
          .catch(err =>
            console.error('Failed to auto-sync after scrobble:', err)
          );
      }

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

      // Set timestamps for tracks and apply artist mappings
      const currentTime = baseTimestamp || Math.floor(Date.now() / 1000);
      const tracksWithTimestamps = tracks.map((track, index) => ({
        ...track,
        artist: artistMappingService.getLastfmName(track.artist),
        timestamp:
          track.timestamp || currentTime - (tracks.length - index - 1) * 180, // 3 minutes apart
      }));

      const results = await lastfmService.scrobbleBatch(tracksWithTimestamps);

      // Trigger incremental sync after successful scrobble
      if (results.success > 0 && scrobbleHistorySyncService) {
        // Fire and forget - don't wait for sync to complete
        scrobbleHistorySyncService
          .startIncrementalSync()
          .catch(err =>
            console.error('Failed to auto-sync after scrobble:', err)
          );
      }

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

          const originalArtist = track.artist || release.artist;
          const mappedArtist =
            artistMappingService.getLastfmName(originalArtist);

          const scrobbleTrack: ScrobbleTrack = {
            artist: mappedArtist,
            track: track.title,
            album: release.title,
            albumCover: release.cover_image,
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

  // Delete a scrobble session
  router.delete('/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      // Validate sessionId format to prevent path traversal
      if (!validateSessionId(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format',
        });
      }

      const sessionPath = `scrobbles/session-${sessionId}.json`;
      const session = await fileStorage.readJSON<ScrobbleSession>(sessionPath);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      // Only allow deletion of pending or failed sessions
      if (session.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete completed sessions',
        });
      }

      await fileStorage.delete(sessionPath);

      res.json({
        success: true,
        data: {
          message: 'Session deleted successfully',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to delete session',
      });
    }
  });

  // Resubmit a failed or pending scrobble session
  router.post(
    '/session/:sessionId/resubmit',
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;

        // Validate sessionId format to prevent path traversal
        if (!validateSessionId(sessionId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid session ID format',
          });
        }

        const sessionPath = `scrobbles/session-${sessionId}.json`;
        const session =
          await fileStorage.readJSON<ScrobbleSession>(sessionPath);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found',
          });
        }

        // Only allow resubmission of pending or failed sessions
        if (session.status === 'completed') {
          return res.status(400).json({
            success: false,
            error: 'Cannot resubmit completed sessions',
          });
        }

        // Check authentication
        const testResult = await lastfmService.testConnection();
        if (!testResult.success) {
          return res.status(500).json({
            success: false,
            error: testResult.message,
          });
        }

        // Update session status to in-progress
        session.status = 'in-progress';
        session.progress = {
          current: 0,
          total: session.tracks.length,
          success: 0,
          failed: 0,
          ignored: 0,
        };
        session.error = undefined;

        await fileStorage.writeJSON(sessionPath, session);

        // Start resubmitting tracks (without creating a new session)
        const results = await lastfmService.resubmitTracks(session.tracks);

        // Update session with results
        session.status = results.success > 0 ? 'completed' : 'failed';
        session.progress = {
          current: session.tracks.length,
          total: session.tracks.length,
          success: results.success,
          failed: results.failed,
          ignored: results.ignored,
        };
        session.error = results.errors?.join('; ') || undefined;

        await fileStorage.writeJSON(sessionPath, session);

        res.json({
          success: true,
          data: {
            message: 'Session resubmitted successfully',
            results,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to resubmit session',
        });
      }
    }
  );

  // Backfill existing scrobble sessions with album covers
  router.post('/backfill-covers', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username || !discogsService) {
        return res.status(400).json({
          success: false,
          error: 'Username is required and Discogs service must be available',
        });
      }

      // Get all scrobble sessions
      const sessions = await lastfmService.getScrobbleHistory();
      let updatedSessions = 0;
      let updatedTracks = 0;

      for (const session of sessions) {
        let sessionUpdated = false;

        for (const track of session.tracks) {
          if (!track.albumCover && track.album) {
            try {
              // Try to find matching album in user's collection
              const searchResults = await discogsService.searchCollection(
                username,
                track.album
              );

              if (searchResults && searchResults.length > 0) {
                // Find the best match (exact album title match preferred)
                const exactMatch = searchResults.find(
                  (item: { release: { title: string } }) =>
                    item.release.title.toLowerCase() ===
                    track.album?.toLowerCase()
                );
                const matchedItem = exactMatch || searchResults[0];

                if (matchedItem?.release?.cover_image) {
                  track.albumCover = matchedItem.release.cover_image;
                  updatedTracks++;
                  sessionUpdated = true;
                }
              }
            } catch (error) {
              // Continue with other tracks if one fails
              console.warn(
                `Failed to find cover for album: ${track.album}`,
                error
              );
            }
          }
        }

        if (sessionUpdated) {
          // Save the updated session directly to file
          await fileStorage.writeJSON(
            `scrobbles/session-${session.id}.json`,
            session
          );
          updatedSessions++;
        }
      }

      res.json({
        success: true,
        data: {
          message: 'Backfill completed',
          updatedSessions,
          updatedTracks,
          totalSessions: sessions.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to backfill album covers',
      });
    }
  });

  return router;
}
