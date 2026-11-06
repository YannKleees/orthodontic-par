/**
 * @file debug.js
 * @description Diagnostic endpoints for clinical data system validation.
 * Provides tools for verifying file storage, report generation, and data integrity.
 */

import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_ROOT = path.resolve(__dirname, "..", "data", "reports");

export const router = Router();

/**
 * Validates file existence and metadata for clinical reports.
 * 
 * @route GET /file-check/:pid/:filename
 * @param {string} pid - Patient identifier
 * @param {string} filename - Report filename
 * @returns File metadata and accessibility status
 */
router.get("/file-check/:pid/:filename", async (req, res) => {
  try {
    const { pid, filename } = req.params;
    const folderPath = path.join(REPORT_ROOT, pid);
    const filePath = path.join(folderPath, filename);
    
    const results = {
      requestedPath: filePath,
      folderExists: await fs.pathExists(folderPath),
      fileExists: await fs.pathExists(filePath),
      folderContents: await fs.pathExists(folderPath) ? 
        await fs.readdir(folderPath) : [],
      staticUrl: `/static/reports/${pid}/${filename}`
    };
    
    if (results.fileExists) {
      const stats = await fs.stat(filePath);
      results.fileSize = stats.size;
      results.fileCreated = stats.birthtime;
      results.fileModified = stats.mtime;
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retrieves all clinical reports for a patient.
 * 
 * @route GET /list-reports/:pid
 * @param {string} pid - Patient identifier
 * @returns Array of report files with metadata
 */
router.get("/list-reports/:pid", async (req, res) => {
  try {
    const { pid } = req.params;
    const folderPath = path.join(REPORT_ROOT, pid);
    
    const results = {
      folder: folderPath,
      exists: await fs.pathExists(folderPath),
      files: []
    };
    
    if (results.exists) {
      const files = await fs.readdir(folderPath);
      results.files = await Promise.all(files.map(async (file) => {
        const filePath = path.join(folderPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          url: `/static/reports/${pid}/${file}`
        };
      }));
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Validates PDF report generation and storage.
 * Performs deep validation of file system hierarchy.
 * 
 * @route GET /pdf-report-check/:pid
 * @param {string} pid - Patient identifier
 * @returns Detailed report accessibility diagnostic
 */
router.get("/pdf-report-check/:pid", async (req, res) => {
  try {
    const { pid } = req.params;
    const folderPath = path.join(REPORT_ROOT, pid);
    
    const results = {
      folderPath,
      folderExists: await fs.pathExists(folderPath),
      reportRootPath: REPORT_ROOT,
      reportRootExists: await fs.pathExists(REPORT_ROOT),
      parentFolderExists: await fs.pathExists(path.dirname(REPORT_ROOT)),
      files: []
    };
    
    if (results.folderExists) {
      const files = await fs.readdir(folderPath);
      results.files = await Promise.all(files.map(async (file) => {
        const filePath = path.join(folderPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          path: filePath,
          url: `/static/reports/${pid}/${file}`
        };
      }));
    }
    
    // Also check the parent folders to see if they exist
    if (results.reportRootExists) {
      const rootFolders = await fs.readdir(REPORT_ROOT);
      results.reportRootContents = rootFolders;
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * Validates file path security and directory traversal prevention.
 * 
 * @route GET /debug-file-paths/:pid
 * @param {string} pid - Patient identifier
 * @returns Path normalization and security validation results
 */
router.get("/debug-file-paths/:pid", async (req, res) => {
  try {
    const { pid } = req.params;
    const folderPath = path.join(REPORT_ROOT, pid);
    
    // Get the absolute path of the REPORT_ROOT
    const reportRootAbsolute = path.resolve(REPORT_ROOT);
    
    // Normalize the folderPath and filePath for comparison
    const normalizedFolderPath = path.normalize(folderPath);
    
    const results = {
      folderPath,
      folderExists: await fs.pathExists(folderPath),
      reportRootAbsolute,
      normalizedFolderPath,
      isSubdirectory: normalizedFolderPath.startsWith(reportRootAbsolute)
    };
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
