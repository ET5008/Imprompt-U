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
    fileSize: 25 * 1024 * 1024,
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

type ResolvedSource = {
  sessionId: string;
  filename: string;
  localUploadPath: string | null;
  storagePath: string;
  parseUrl: string;
  shouldUploadToStorage: boolean;
  existingTextbook: TextbookRow | null;
};

function logStage(stage: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`[upload] ${stage}`, details);
    return;
  }
  console.log(`[upload] ${stage}`);
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]/g, '-');
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePrintedPageFromLine(line: string): number | null {
  const match = line.trim().match(/^[-\s]*([0-9]{1,4})[-\s]*$/);
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

  const candidates = [...lines.slice(0, 3), ...lines.slice(Math.max(0, lines.length - 3))];

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

function toTocEntry(title: string, pageNum: number): TocEntry | null {
  const cleanTitle = cleanLine(title);
  if (!cleanTitle || !Number.isInteger(pageNum) || pageNum <= 0) {
    return null;
  }

  const chapterMatch = cleanTitle.match(/(chapter\s+[0-9ivxlcdm]+)/i);

  return {
    title: cleanTitle,
    chapter: chapterMatch ? chapterMatch[1] : null,
    bookPage: pageNum,
    pdfStartPage: -1,
  };
}

function parseTocLinesFromPage(pageText: string): TocEntry[] {
  const lines = pageText
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const entries: TocEntry[] = [];

  for (const line of lines) {
    const dotted = line.match(/^(.{3,}?)\s(?:\.{2,}|[-_]{2,}|\s{2,})\s*([0-9]{1,4})$/);
    const spaced = line.match(/^(.{3,}?)\s+([0-9]{1,4})$/);

    const match = dotted ?? spaced;
    if (!match) {
      continue;
    }

    const parsed = toTocEntry(match[1], Number(match[2]));
    if (parsed) {
      entries.push(parsed);
    }
  }

  return entries;
}

function parseTocEntriesFromTextBlock(pageText: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const compact = pageText.replace(/\s+/g, ' ').trim();

  const regex =
    /(chapter\s+[0-9ivxlcdm]+[^0-9]{0,120}?|[0-9]+(?:\.[0-9]+){0,3}\s+[A-Za-z][^0-9]{0,120}?)(?:\.{2,}|\s{2,}|[-_]{2,})\s*([0-9]{1,4})/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(compact)) !== null) {
    const parsed = toTocEntry(match[1], Number(match[2]));
    if (parsed) {
      entries.push(parsed);
    }
  }

  return entries;
}

function countLikelyTocEntries(pageText: string): number {
  return parseTocLinesFromPage(pageText).length + parseTocEntriesFromTextBlock(pageText).length;
}

function extractTocEntries(pageTexts: string[]): TocEntry[] {
  const maxScan = Math.min(pageTexts.length, 80);
  const scanPages = pageTexts.slice(0, maxScan);

  let tocStart = scanPages.findIndex((page) => {
    const normalized = normalizeForSearch(page);
    return normalized.includes('table of contents') || normalized.includes('contents');
  });

  if (tocStart < 0) {
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < Math.min(scanPages.length, 30); i += 1) {
      const score = countLikelyTocEntries(scanPages[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestScore >= 4) {
      tocStart = bestIdx;
    }
  }

  if (tocStart < 0) {
    return [];
  }

  const tocEntries: TocEntry[] = [];
  const tocEnd = Math.min(maxScan, tocStart + 20);

  for (let i = tocStart; i < tocEnd; i += 1) {
    tocEntries.push(...parseTocLinesFromPage(pageTexts[i]));
    tocEntries.push(...parseTocEntriesFromTextBlock(pageTexts[i]));
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
    const endIndex = next ? Math.max(startIndex, next.pdfStartPage - 2) : pageTexts.length - 1;

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

function buildTopicsFromChapterHeadings(pageTexts: string[]): ParsedTopic[] {
  const starts: Array<{ title: string; chapter: string | null; pageIndex: number }> = [];

  for (let i = 0; i < pageTexts.length; i += 1) {
    const normalized = normalizeForSearch(pageTexts[i]).slice(0, 700);
    const match = normalized.match(/\b(chapter\s+[0-9ivxlcdm]+)\b/i);
    if (!match) {
      continue;
    }

    starts.push({
      title: match[1],
      chapter: match[1],
      pageIndex: i,
    });
  }

  const dedupedStarts = starts.filter(
    (item, idx) =>
      idx === 0 ||
      item.title !== starts[idx - 1].title ||
      item.pageIndex - starts[idx - 1].pageIndex > 1
  );

  const topics: ParsedTopic[] = [];
  for (let i = 0; i < dedupedStarts.length; i += 1) {
    const current = dedupedStarts[i];
    const next = dedupedStarts[i + 1];
    const endIndex = next ? Math.max(current.pageIndex, next.pageIndex - 1) : pageTexts.length - 1;
    const content = pageTexts.slice(current.pageIndex, endIndex + 1).join('\n\n').trim();

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
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 15);

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

async function resolvePdfSource(req: any, bucket: string): Promise<ResolvedSource> {
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

  let query = supabase.from('textbooks').select('id, session_id, filename, storage_path').limit(1);

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

async function processAndStoreTopics(source: ResolvedSource, bucket: string) {
  logStage('process-start', {
    sessionId: source.sessionId,
    storagePath: source.storagePath,
    mode: source.shouldUploadToStorage ? 'new-upload' : 'from-db',
  });

  if (source.shouldUploadToStorage) {
    if (!source.localUploadPath) {
      throw new Error('Uploaded file path missing.');
    }

    const readStream = fs.createReadStream(source.localUploadPath);
    const { error: storageError } = await supabase.storage.from(bucket).upload(source.storagePath, readStream as any, {
      contentType: 'application/pdf',
      upsert: false,
    });

    if (storageError) {
      throw new Error(`Failed to upload PDF to Supabase Storage: ${storageError.message}`);
    }

    source.parseUrl = await createSignedPdfUrl(bucket, source.storagePath);
    logStage('storage-upload-complete', {
      storagePath: source.storagePath,
      bucket,
    });
  }

  // Ensure textbook row exists before topics are processed.
  let textbookId: string;
  if (source.existingTextbook) {
    textbookId = source.existingTextbook.id;
    logStage('textbook-row-found', { textbookId });
  } else {
    const { data: textbook, error: textbookError } = await supabase
      .from('textbooks')
      .insert({
        session_id: source.sessionId,
        filename: source.filename,
        storage_path: source.storagePath,
        page_count: null,
      })
      .select('id')
      .single();

    if (textbookError || !textbook) {
      throw new Error(`Failed to store textbook record: ${textbookError?.message || 'unknown error'}`);
    }

    textbookId = textbook.id;
    logStage('textbook-row-created', {
      textbookId,
      sessionId: source.sessionId,
      storagePath: source.storagePath,
    });
  }

  const { pageTexts, numPages } = await extractPdfPagesFromUrl(source.parseUrl);
  logStage('pdf-parsed', { numPages, extractedPages: pageTexts.length });
  if (pageTexts.length === 0) {
    throw new Error('Could not extract enough text from this PDF.');
  }

  const pageOffset = detectBookToPdfOffset(pageTexts);
  const tocEntries = extractTocEntries(pageTexts);
  const mappedEntries = mapTocToPdfPages(tocEntries, pageOffset, numPages);
  logStage('toc-analysis-complete', {
    pageOffset,
    tocEntries: tocEntries.length,
    mappedEntries: mappedEntries.length,
  });

  const topics =
    mappedEntries.length > 0
      ? buildTopicsFromTocEntries(pageTexts, mappedEntries)
      : buildTopicsFromChapterHeadings(pageTexts);
  logStage('topic-build-complete', {
    topics: topics.length,
    strategy: mappedEntries.length > 0 ? 'toc' : 'chapter-fallback',
  });

  if (topics.length === 0) {
    throw new Error('Could not build chapter topics from table of contents or chapter headings.');
  }

  const { error: textbookUpdateError } = await supabase
    .from('textbooks')
    .update({ page_count: numPages })
    .eq('id', textbookId);

  if (textbookUpdateError) {
    throw new Error(`Failed to update textbook record: ${textbookUpdateError.message}`);
  }
  logStage('textbook-row-updated', { textbookId, pageCount: numPages });

  const { error: deleteTopicsError } = await supabase
    .from('topics')
    .delete()
    .eq('textbook_id', textbookId);

  if (deleteTopicsError) {
    throw new Error(`Failed to clear existing topics: ${deleteTopicsError.message}`);
  }
  logStage('topics-cleared', { textbookId });

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
    .select('id, title, chapter, topic_order')
    .order('topic_order', { ascending: true });

  if (topicsError) {
    throw new Error(`Failed to store topics: ${topicsError.message}`);
  }
  logStage('topics-insert-complete', {
    textbookId,
    insertedTopics: (savedTopics ?? []).length,
  });

  logStage('process-complete', {
    sessionId: source.sessionId,
    textbookId,
    numPages,
  });

  return {
    sessionId: source.sessionId,
    detectedOffset: pageOffset,
    tocEntries: mappedEntries.map((entry) => ({
      title: entry.title,
      bookPage: entry.bookPage,
      pdfStartPage: entry.pdfStartPage,
    })),
    topics: savedTopics ?? [],
  };
}

router.post('/', upload.single('pdf'), async (req, res) => {
  let localUploadPath: string | null = null;

  try {
    const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';
    logStage('route-upload-start', { bucket });
    const source = await resolvePdfSource(req, bucket);
    localUploadPath = source.localUploadPath;
    logStage('source-resolved', {
      sessionId: source.sessionId,
      mode: source.shouldUploadToStorage ? 'new-upload' : 'existing-db',
      hasTempFile: Boolean(source.localUploadPath),
    });

    const result = await processAndStoreTopics(source, bucket);
    logStage('route-upload-success', {
      sessionId: result.sessionId,
      topics: result.topics.length,
      tocEntries: result.tocEntries.length,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    logStage('route-upload-failed', {
      error: err instanceof Error ? err.message : 'Upload failed',
    });
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  } finally {
    if (localUploadPath && fs.existsSync(localUploadPath)) {
      fs.unlinkSync(localUploadPath);
      logStage('temp-file-cleanup-complete', { localUploadPath });
    }
  }
});

router.post('/from-db', async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';
    logStage('route-from-db-start', { bucket });
    const source = await resolvePdfSource({ body: req.body }, bucket);

    if (!source.existingTextbook) {
      return res.status(400).json({
        error: 'Use textbookId/sessionId for an existing stored PDF.',
      });
    }
    logStage('from-db-source-resolved', {
      sessionId: source.sessionId,
      textbookId: source.existingTextbook.id,
    });

    const result = await processAndStoreTopics(source, bucket);
    logStage('route-from-db-success', {
      sessionId: result.sessionId,
      topics: result.topics.length,
      tocEntries: result.tocEntries.length,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    logStage('route-from-db-failed', {
      error: err instanceof Error ? err.message : 'Process from DB failed',
    });
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Process from DB failed',
    });
  }
});

export default router;
