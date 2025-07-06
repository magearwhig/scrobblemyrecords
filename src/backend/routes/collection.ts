import express, { Request, Response } from 'express';
import { FileStorage } from '../utils/fileStorage';
import { AuthService } from '../services/authService';
import { DiscogsService } from '../services/discogsService';

const router = express.Router();

// Initialize services
const fileStorage = new FileStorage();
const authService = new AuthService(fileStorage);
const discogsService = new DiscogsService(fileStorage, authService);

// Get user's collection
router.get('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 50;
    const forceReload = req.query.force_reload === 'true';
    
    const result = await discogsService.getUserCollection(username, page, perPage, forceReload);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get user's entire collection for sorting
router.get('/:username/all', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const forceReload = req.query.force_reload === 'true';
    
    console.log(`📦 Loading entire collection for ${username} (forceReload: ${forceReload})`);
    
    // Get all cached pages
    const allItems: any[] = [];
    let pageNumber = 1;
    
    while (true) {
      const cacheKey = `collections/${username}-page-${pageNumber}.json`;
      const cached = await fileStorage.readJSON<any>(cacheKey);
      
      if (!cached || !discogsService.isCacheValid(cached) || !cached.data) {
        break;
      }
      
      allItems.push(...cached.data);
      pageNumber++;
    }
    
    console.log(`📦 Loaded ${allItems.length} items from cache for ${username}`);
    
    res.json({
      success: true,
      data: allItems,
      total: allItems.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error loading entire collection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Search user's collection
router.get('/:username/search', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { q: query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const results = await discogsService.searchCollection(username, query as string);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Search user's collection with pagination (using cache)
router.get('/:username/search-paginated', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { q: query } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 50;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const results = await discogsService.searchCollectionFromCache(username, query as string, page, perPage);
    
    res.json({
      success: true,
      data: results.items,
      pagination: {
        page,
        per_page: perPage,
        total: results.total,
        pages: results.totalPages
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start preloading all collection pages
router.post('/:username/preload', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    
    // Start preloading in background (don't await)
    discogsService.preloadAllCollectionPages(username).catch(error => {
      console.error('Background preload failed:', error);
    });
    
    res.json({
      success: true,
      data: { message: 'Collection preloading started in background' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get release details
router.get('/release/:releaseId', async (req: Request, res: Response) => {
  try {
    const releaseId = parseInt(req.params.releaseId);
    
    if (isNaN(releaseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid release ID'
      });
    }
    
    const release = await discogsService.getReleaseDetails(releaseId);
    
    if (!release) {
      return res.status(404).json({
        success: false,
        error: 'Release not found'
      });
    }
    
    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear collection cache
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    await discogsService.clearCache();
    
    res.json({
      success: true,
      data: { message: 'Collection cache cleared' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get cache progress for user
router.get('/:username/progress', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    
    const progress = await discogsService.getCacheProgress(username);
    
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;