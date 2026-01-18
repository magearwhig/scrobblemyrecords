/**
 * Backup Routes - API endpoints for backup and restore functionality.
 *
 * Routes:
 * - GET  /preview          - Get backup preview (counts)
 * - GET  /settings         - Get auto-backup settings
 * - PUT  /settings         - Update auto-backup settings
 * - GET  /auto-backups     - List auto-backup files
 * - POST /export           - Generate JSON backup
 * - POST /import/preview   - Upload and preview import
 * - POST /import           - Execute import
 * - DELETE /auto-backups/:filename - Delete auto-backup
 */

import express, { Request, Response } from 'express';

import { BackupExportOptions, BackupImportOptions } from '../../shared/types';
import { BackupService } from '../services/backupService';
import { createLogger } from '../utils/logger';

const logger = createLogger('BackupRoutes');

export default function createBackupRouter(backupService: BackupService) {
  const router = express.Router();

  // ============================================
  // Static Routes (no parameters)
  // ============================================

  /**
   * GET /api/v1/backup/preview
   * Get a preview of what would be included in a backup export.
   */
  router.get('/preview', async (_req: Request, res: Response) => {
    try {
      const preview = await backupService.getBackupPreview();
      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      logger.error('Error getting backup preview', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/backup/settings
   * Get auto-backup settings.
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await backupService.getSettings();
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting backup settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /api/v1/backup/settings
   * Update auto-backup settings.
   */
  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const settings = await backupService.saveSettings(req.body);
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error saving backup settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/backup/auto-backups
   * List available auto-backup files.
   */
  router.get('/auto-backups', async (_req: Request, res: Response) => {
    try {
      const backups = await backupService.listAutoBackups();
      res.json({
        success: true,
        data: backups,
      });
    } catch (error) {
      logger.error('Error listing auto-backups', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Action Routes
  // ============================================

  /**
   * POST /api/v1/backup/export
   * Generate and return a backup file.
   *
   * Body:
   * - includeCredentials: boolean
   * - password?: string (required if includeCredentials is true)
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const options: BackupExportOptions = {
        includeCredentials: req.body.includeCredentials || false,
        password: req.body.password,
      };

      if (options.includeCredentials && !options.password) {
        return res.status(400).json({
          success: false,
          error: 'Password is required when including credentials',
        });
      }

      const backupJson = await backupService.exportBackup(options);

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `recordscrobbles-backup-${timestamp}.json`;

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.send(backupJson);
    } catch (error) {
      logger.error('Error exporting backup', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/backup/import/preview
   * Preview what would happen if a backup was imported.
   *
   * Body:
   * - backup: string (JSON backup file content)
   */
  router.post('/import/preview', async (req: Request, res: Response) => {
    try {
      const { backup } = req.body;

      if (!backup) {
        return res.status(400).json({
          success: false,
          error: 'Backup content is required',
        });
      }

      const preview = await backupService.previewImport(backup);
      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      logger.error('Error previewing import', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/backup/import
   * Import a backup file.
   *
   * Body:
   * - backup: string (JSON backup file content)
   * - mode: 'merge' | 'replace'
   * - password?: string (required if backup includes credentials)
   */
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const { backup, mode, password } = req.body;

      if (!backup) {
        return res.status(400).json({
          success: false,
          error: 'Backup content is required',
        });
      }

      if (!mode || (mode !== 'merge' && mode !== 'replace')) {
        return res.status(400).json({
          success: false,
          error: 'Mode must be "merge" or "replace"',
        });
      }

      const options: BackupImportOptions = {
        mode,
        password,
      };

      const result = await backupService.importBackup(backup, options);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.errors.join(', '),
          data: result,
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error importing backup', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/backup/auto-backup/run
   * Manually trigger an auto-backup.
   */
  router.post('/auto-backup/run', async (_req: Request, res: Response) => {
    try {
      await backupService.runAutoBackup();
      res.json({
        success: true,
        data: { message: 'Auto-backup completed' },
      });
    } catch (error) {
      logger.error('Error running auto-backup', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Parameterized Routes
  // ============================================

  /**
   * DELETE /api/v1/backup/auto-backups/:filename
   * Delete an auto-backup file.
   */
  router.delete(
    '/auto-backups/:filename',
    async (req: Request, res: Response) => {
      try {
        const { filename } = req.params;

        if (!filename) {
          return res.status(400).json({
            success: false,
            error: 'Filename is required',
          });
        }

        await backupService.deleteAutoBackup(filename);
        res.json({
          success: true,
          data: { message: 'Backup deleted' },
        });
      } catch (error) {
        logger.error('Error deleting auto-backup', error);
        const statusCode = (error as Error).message.includes('Invalid')
          ? 400
          : 500;
        res.status(statusCode).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
