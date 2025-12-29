/**
 * Document Processing Routes
 *
 * High-volume document processing powered by FileProcess
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

export function createDocumentRoutes(
  nexusClients: { mageAgent: any; graphRAG: any; fileProcess: any },
  db: { pg: any; redis: any }
) {
  const router = Router();

  /**
   * Process single document
   */
  router.post(
    '/process',
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const metadata = JSON.parse(req.body.metadata || '{}');
      const options = JSON.parse(req.body.options || '{}');

      // Process document using FileProcess
      const result = await nexusClients.fileProcess.processDocument({
        source: req.file.buffer,
        sourceType: 'buffer',
        metadata: {
          fileName: req.file.originalname,
          fileType: req.file.mimetype.includes('pdf') ? 'pdf' : 'docx',
          ...metadata,
        },
        options: {
          enableOCR: true,
          extractTables: true,
          autoExtractMetadata: true,
          createChunks: true,
          ...options,
        },
      });

      // Store document DNA in GraphRAG
      if (result.status === 'completed') {
        await nexusClients.graphRAG.storeDocument({
          content: result.content.text,
          metadata: {
            title: metadata.fileName || req.file.originalname,
            docType: metadata.docType || 'case',
            jurisdiction: metadata.jurisdiction || 'us',
            ...result.extractedMetadata,
          },
        });
      }

      res.json({
        success: true,
        data: result,
      });
    })
  );

  /**
   * Process document batch
   */
  router.post(
    '/process/batch',
    upload.array('files', 100),
    asyncHandler(async (req: Request, res: Response) => {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const documents = files.map((file) => ({
        source: file.buffer,
        sourceType: 'buffer' as const,
        metadata: {
          fileName: file.originalname,
          fileType: file.mimetype.includes('pdf') ? ('pdf' as const) : ('docx' as const),
          jurisdiction: 'us',
          docType: 'case' as const,
        },
        options: {
          enableOCR: true,
          extractTables: true,
          autoExtractMetadata: true,
          createChunks: true,
        },
      }));

      const job = await nexusClients.fileProcess.processBatch({
        documents,
        options: {
          concurrency: 10,
          stopOnError: false,
        },
      });

      res.json({
        success: true,
        data: job,
      });
    })
  );

  /**
   * Get batch job status
   */
  router.get(
    '/jobs/:jobId',
    asyncHandler(async (req: Request, res: Response) => {
      const { jobId } = req.params;
      const status = await nexusClients.fileProcess.getJobStatus(jobId);

      res.json({
        success: true,
        data: status,
      });
    })
  );

  /**
   * Classify document
   */
  router.post(
    '/classify',
    validateRequest({
      body: Joi.object({
        content: Joi.string().required(),
        jurisdiction: Joi.string().optional(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { content, jurisdiction } = req.body;

      const classification = await nexusClients.fileProcess.classifyDocument(content, jurisdiction);

      res.json({
        success: true,
        data: classification,
      });
    })
  );

  /**
   * Extract metadata from document
   */
  router.post(
    '/extract/metadata',
    validateRequest({
      body: Joi.object({
        content: Joi.string().required(),
        docType: Joi.string().optional(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { content, docType } = req.body;

      const metadata = await nexusClients.fileProcess.extractMetadata(content, docType);

      res.json({
        success: true,
        data: metadata,
      });
    })
  );

  return router;
}
