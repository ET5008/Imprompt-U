import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { supabase } from '../lib/supabase';

const router = Router();

const uploadTempDir = path.join(os.tmpdir(), 'imprompt-u-upload');
fs.mkdirSync(uploadTempDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTempDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${randomUUID()}-${sanitizeFilename(file.originalname)}`),
  }),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

type ParsedTopic = {
  title: string;
  chapter?: string | null;
  content: string;
};

type TocEntry = {
  title: string;
  chapter: string | null;
  bookPage: number;
  pdfStartPage: number;
};

type TextbookRow = {
  id: string;
  session_id: string;
  filename: string;
  storage_path: string;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]/g, '-');
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function parsePrintedPageFromLine(line: string): number | null {
  const match = line.trim().match(/^[-–—\s]*([0-9]{1,4})[-–—\s]*$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function extractPrintedPageNumber(pageText: string): number | null {
  const lines = pageText
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const candidates = [
    ...lines.slice(0, 3),
    ...lines.slice(Math.max(0, lines.length - 3)),
  ];

  for (const line of candidates) {
    const value = parsePrintedPageFromLine(line);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function detectBookToPdfOffset(pageTexts: string[]): number {
  const printedPages = pageTexts.map(extractPrintedPageNumber);

  let bestIndex = -1;
  let bestPrintedPage = -1;
  let bestScore = -1;

  for (let i = 0; i < printedPages.length; i += 1) {
    const current = printedPages[i];
    if (current === null) {
      continue;
    }

    let score = 0;
    for (let delta = 1; delta <= 6 && i + delta < printedPages.length; delta += 1) {
      if (printedPages[i + delta] === current + delta) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
      bestPrintedPage = current;
    }
  }

  if (bestIndex < 0) {
    return 0;
  }

  return bestIndex + 1 - bestPrintedPage;
}

function parseTocLinesFromPage(pageText: string): TocEntry[] {
  const lines = pageText
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const entries: TocEntry[] = [];

  for (const line of lines) {
    // Example: "Chapter 3 Kinematics ........ 42" or "3.1 Motion 45"
    const match = line.match(
      /^(.{3,}?)\s(?:\.{2,}|\s{2,}|·{2,})\s*([0-9]{1,4})$/
    );
    if (!match) {
      continue;
    }

    const rawTitle = cleanLine(match[1]);
    const pageNum = Number(match[2]);

    if (!rawTitle || !Number.isInteger(pageNum) || pageNum <= 0) {
      continue;
    }

    const chapterMatch = rawTitle.match(/(chapter\s+[0-9ivxlcdm]+)/i);
    entries.push({
      title: rawTitle,
      chapter: chapterMatch ? chapterMatch[1] : null,
      bookPage: pageNum,
      pdfStartPage: -1,
    });
  }

  return entries;
}

function extractTocEntries(pageTexts: string[]): TocEntry[] {
  const maxScan = Math.min(pageTexts.length, 40);
  const tocStart = pageTexts
    .slice(0, maxScan)
    .findIndex((page) => /(^|\n)\s*(table of contents|contents)\s*($|\n)/i.test(page));

  if (tocStart < 0) {
    return [];
  }

  const tocEntries: TocEntry[] = [];
  const tocEnd = Math.min(maxScan, tocStart + 10);

  for (let i = tocStart; i < tocEnd; i += 1) {
    tocEntries.push(...parseTocLinesFromPage(pageTexts[i]));
  }

  const deduped = new Map<string, TocEntry>();
  for (const entry of tocEntries) {
    const key = `${entry.title.toLowerCase()}|${entry.bookPage}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  return Array.from(deduped.values());
}

function mapTocToPdfPages(tocEntries: TocEntry[], offset: number, totalPages: number): TocEntry[] {
  return tocEntries
    .map((entry) => ({
      ...entry,
      pdfStartPage: entry.bookPage + offset,
    }))
    .filter((entry) => entry.pdfStartPage >= 1 && entry.pdfStartPage <= totalPages)
    .sort((a, b) => a.pdfStartPage - b.pdfStartPage);
}

function buildTopicsFromTocEntries(pageTexts: string[], mappedEntries: TocEntry[]): ParsedTopic[] {
  const topics: ParsedTopic[] = [];

  for (let i = 0; i < mappedEntries.length; i += 1) {
    const current = mappedEntries[i];
    const next = mappedEntries[i + 1];

    const startIndex = Math.max(0, current.pdfStartPage - 1);
    const endIndex = next
      ? Math.max(startIndex, next.pdfStartPage - 2)
      : pageTexts.length - 1;

    const content = pageTexts.slice(startIndex, endIndex + 1).join('\n\n').trim();
    if (!content) {
      continue;
    }

    topics.push({
      title: current.title,
      chapter: current.chapter,
      content,
    });
  }

  return topics;
}

async function createSignedPdfUrl(bucket: string, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 15);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || 'unknown error'}`);
  }

  return data.signedUrl;
}

async function extractPdfPagesFromUrl(url: string): Promise<{ pageTexts: string[]; numPages: number }> {
  const parser = new PDFParse({ url });

  try {
    const info = await parser.getInfo();
    const numPages = info.total ?? 0;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum += 1) {
      const pageResult = await parser.getText({ partial: [pageNum] });
      const text = pageResult.pages[0]?.text?.trim() ?? '';
      pageTexts.push(text);
    }

    return { pageTexts, numPages };
  } finally {
    await parser.destroy();
  }
}

async function resolvePdfSource(
  req: any,
  bucket: string
): Promise<{
  sessionId: string;
  filename: string;
  localUploadPath: string | null;
  storagePath: string;
  parseUrl: string;
  shouldUploadToStorage: boolean;
  existingTextbook: TextbookRow | null;
}> {
  if (req.file) {
    if (req.file.mimetype !== 'application/pdf') {
      throw new Error('Only PDF files are allowed.');
    }

    const sessionId = randomUUID();
    const safeFilename = sanitizeFilename(req.file.originalname);
    const storagePath = `${sessionId}/${safeFilename}`;

    return {
      sessionId,
      filename: req.file.originalname,
      localUploadPath: req.file.path as string,
      storagePath,
      parseUrl: '',
      shouldUploadToStorage: true,
      existingTextbook: null,
    };
  }

  const textbookId: string | undefined = req.body?.textbookId;
  const sessionId: string | undefined = req.body?.sessionId;

  if (!textbookId && !sessionId) {
    throw new Error('Provide either form-data key "pdf" or JSON body with "textbookId"/"sessionId".');
  }

  let query = supabase
    .from('textbooks')
    .select('id, session_id, filename, storage_path')
    .limit(1);

  if (textbookId) {
    query = query.eq('id', textbookId);
  } else {
    query = query.eq('session_id', sessionId as string);
  }

  const { data: textbook, error: textbookError } = await query.single<TextbookRow>();
  if (textbookError || !textbook) {
    throw new Error(`Textbook not found: ${textbookError?.message || 'unknown error'}`);
  }

  const parseUrl = await createSignedPdfUrl(bucket, textbook.storage_path);

  return {
    sessionId: textbook.session_id,
    filename: textbook.filename,
    localUploadPath: null,
    storagePath: textbook.storage_path,
    parseUrl,
    shouldUploadToStorage: false,
    existingTextbook: textbook,
  };
}

router.post('/', upload.single('pdf'), async (req, res) => {
  let storagePath: string | null = null;
  let textbookId: string | null = null;
  let localUploadPath: string | null = null;
  let createdStorageObject = false;
  let createdTextbookRow = false;

  try {
    const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';
    console.log('[upload] Upload request received');
    const source = await resolvePdfSource(req, bucket);
    storagePath = source.storagePath;
    localUploadPath = source.localUploadPath;
    console.log(`[upload] Resolved PDF source — file: "${source.filename}", sessionId: ${source.sessionId}`);

    // 0) If this is a fresh upload, stream temp file to Storage first
    if (source.shouldUploadToStorage) {
      if (!source.localUploadPath) {
        throw new Error('Uploaded file path missing.');
      }

      console.log(`[upload] Step 0: Uploading PDF to Supabase Storage — path: ${source.storagePath}`);
      const readStream = fs.createReadStream(source.localUploadPath);
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .upload(source.storagePath, readStream as any, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Failed to upload PDF to Supabase Storage: ${storageError.message}`);
      }

      createdStorageObject = true;
      console.log('[upload] Step 0: Storage upload complete — generating signed URL');
      source.parseUrl = await createSignedPdfUrl(bucket, source.storagePath);
      console.log('[upload] Step 0: Signed URL created');
    }

    // 1) Extract per-page text from signed URL (avoids backend full-file download buffer)
    console.log('[upload] Step 1: Extracting text from PDF (via signed URL)...');
    const { pageTexts, numPages } = await extractPdfPagesFromUrl(source.parseUrl);
    if (pageTexts.length === 0) {
      return res.status(400).json({
        error: 'Could not extract enough text from this PDF.',
      });
    }
    console.log(`[upload] Step 1: Extracted ${numPages} pages`);

    // 2) Detect where printed numeric book page numbering starts and map TOC pages to PDF pages
    const pageOffset = detectBookToPdfOffset(pageTexts);
    console.log(`[upload] Step 2: Detected book-to-PDF page offset: ${pageOffset}`);

    const tocEntries = extractTocEntries(pageTexts);
    console.log(`[upload] Step 2: Extracted ${tocEntries.length} TOC entries`);

    const mappedEntries = mapTocToPdfPages(tocEntries, pageOffset, numPages);
    console.log(`[upload] Step 2: Mapped ${mappedEntries.length} TOC entries to PDF pages`);

    const topics = buildTopicsFromTocEntries(pageTexts, mappedEntries);
    console.log(`[upload] Step 2: Built ${topics.length} topics from TOC`);

    if (topics.length === 0) {
      return res.status(400).json({
        error: 'This PDF doesn\'t have a recognizable Table of Contents. Please upload a textbook with a formatted Table of Contents (e.g. "Chapter 1 ... 5").',
      });
    }

    // 4) Upsert textbook row
    if (source.existingTextbook) {
      textbookId = source.existingTextbook.id;

      console.log(`[upload] Step 4: Updating existing textbook record (id: ${textbookId})`);
      const { error: textbookUpdateError } = await supabase
        .from('textbooks')
        .update({
          page_count: numPages,
        })
        .eq('id', textbookId);

      if (textbookUpdateError) {
        throw new Error(`Failed to update textbook record: ${textbookUpdateError.message}`);
      }
      console.log('[upload] Step 4: Textbook record updated');
    } else {
      console.log(`[upload] Step 4: Inserting new textbook record — file: "${source.filename}"`);
      const { data: textbook, error: textbookError } = await supabase
        .from('textbooks')
        .insert({
          session_id: source.sessionId,
          filename: source.filename,
          storage_path: source.storagePath,
          page_count: numPages,
        })
        .select('id, session_id')
        .single();

      if (textbookError || !textbook) {
        throw new Error(
          `Failed to store textbook record: ${textbookError?.message || 'unknown error'}`
        );
      }

      textbookId = textbook.id;
      createdTextbookRow = true;
      console.log(`[upload] Step 4: Textbook record inserted (id: ${textbookId})`);
    }

    if (!textbookId) {
      throw new Error('Missing textbook id after upsert.');
    }

    // 5) Replace existing topics for this textbook
    console.log(`[upload] Step 5: Deleting existing topics for textbook (id: ${textbookId})`);
    const { error: deleteTopicsError } = await supabase
      .from('topics')
      .delete()
      .eq('textbook_id', textbookId);

    if (deleteTopicsError) {
      throw new Error(`Failed to clear existing topics: ${deleteTopicsError.message}`);
    }
    console.log('[upload] Step 5: Existing topics deleted');

    // 6) Insert new topic rows
    const topicRows = topics.map((topic, index) => ({
      textbook_id: textbookId,
      topic_order: index,
      title: topic.title,
      chapter: topic.chapter ?? null,
      content: topic.content,
    }));

    console.log(`[upload] Step 6: Inserting ${topicRows.length} topic rows into database`);
    const { data: savedTopics, error: topicsError } = await supabase
      .from('topics')
      .insert(topicRows)
      .select('id, title, chapter, topic_order')
      .order('topic_order', { ascending: true });

    if (topicsError) {
      throw new Error(`Failed to store topics: ${topicsError.message}`);
    }
    console.log(`[upload] Step 6: Inserted ${savedTopics?.length ?? 0} topics — upload complete`);

    return res.status(200).json({
      sessionId: source.sessionId,
      detectedOffset: pageOffset,
      tocEntries: mappedEntries.map((entry) => ({
        title: entry.title,
        bookPage: entry.bookPage,
        pdfStartPage: entry.pdfStartPage,
      })),
      topics: savedTopics ?? [],
    });
  } catch (err) {
    console.error(err);

    // rollback database row if textbook was inserted but later step failed
    if (createdTextbookRow && textbookId) {
      await supabase.from('textbooks').delete().eq('id', textbookId);
    }

    // rollback uploaded file if storage upload succeeded but later step failed
    if (createdStorageObject && storagePath) {
      const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';
      await supabase.storage.from(bucket).remove([storagePath]);
    }

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  } finally {
    if (localUploadPath && fs.existsSync(localUploadPath)) {
      fs.unlinkSync(localUploadPath);
    }
  }
});

router.post('/from-db', async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';

    const source = await resolvePdfSource({ body: req.body }, bucket);
    if (!source.existingTextbook) {
      return res.status(400).json({
        error: 'Use textbookId/sessionId for an existing stored PDF.',
      });
    }

    const { pageTexts, numPages } = await extractPdfPagesFromUrl(source.parseUrl);
    if (pageTexts.length === 0) {
      return res.status(400).json({
        error: 'Could not extract enough text from this PDF.',
      });
    }

    const pageOffset = detectBookToPdfOffset(pageTexts);
    const tocEntries = extractTocEntries(pageTexts);
    const mappedEntries = mapTocToPdfPages(tocEntries, pageOffset, numPages);
    const topics = buildTopicsFromTocEntries(pageTexts, mappedEntries);

    if (topics.length === 0) {
      return res.status(400).json({
        error: 'This PDF doesn\'t have a recognizable Table of Contents. Please upload a textbook with a formatted Table of Contents (e.g. "Chapter 1 ... 5").',
      });
    }

    const textbookId = source.existingTextbook.id;

    const { error: textbookUpdateError } = await supabase
      .from('textbooks')
      .update({
        page_count: numPages,
      })
      .eq('id', textbookId);

    if (textbookUpdateError) {
      throw new Error(`Failed to update textbook record: ${textbookUpdateError.message}`);
    }

    const { error: deleteTopicsError } = await supabase
      .from('topics')
      .delete()
      .eq('textbook_id', textbookId);

    if (deleteTopicsError) {
      throw new Error(`Failed to clear existing topics: ${deleteTopicsError.message}`);
    }

    const topicRows = topics.map((topic, index) => ({
      textbook_id: textbookId,
      topic_order: index,
      title: topic.title,
      chapter: topic.chapter ?? null,
      content: topic.content,
    }));

    const { data: savedTopics, error: topicsError } = await supabase
      .from('topics')
      .insert(topicRows)
      .select('id, title, chapter')
      .order('id', { ascending: true });

    if (topicsError) {
      throw new Error(`Failed to store topics: ${topicsError.message}`);
    }

    return res.status(200).json({
      sessionId: source.sessionId,
      detectedOffset: pageOffset,
      tocEntries: mappedEntries.map((entry) => ({
        title: entry.title,
        bookPage: entry.bookPage,
        pdfStartPage: entry.pdfStartPage,
      })),
      topics: savedTopics ?? [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Process from DB failed',
    });
  }
});

export default router;
