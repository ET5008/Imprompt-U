import { Router } from 'express';
import multer from 'multer';
import * as pdfParse from 'pdf-parse';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

type ClaudeTopic = {
  title: string;
  chapter?: string | null;
  content: string;
};

type ClaudeResponse = {
  content?: Array<{ type: string; text?: string }>;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]/g, '-');
}

async function splitTextWithClaude(fullText: string): Promise<ClaudeTopic[]> {
  const anthropicApiKey = requireEnv('ANTHROPIC_API_KEY');

  const prompt = `
You are helping parse a textbook for a study application.

I will give you raw text extracted from a textbook PDF.
Split it into logical study topics based on chapter and section headings.

Return ONLY valid JSON.
Do not use markdown fences.
Do not include any explanation.

Use exactly this shape:
{
  "topics": [
    {
      "title": "3.1 Kinematics",
      "chapter": "Chapter 3",
      "content": "full text for this section"
    }
  ]
}

Rules:
- Preserve the original textbook wording as much as possible.
- Prefer section-level chunks when obvious (like 3.1, 3.2, 4.1).
- If sections are not obvious, split by chapter.
- Every topic must have:
  - title
  - content
- chapter can be null if unclear.
- Do not summarize unless the text is too noisy to preserve exactly.
- Never omit the topics array.

TEXT:
${fullText}
`.trim();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ClaudeResponse;

  const textBlock = data.content?.find(
    (block) => block.type === 'text' && typeof block.text === 'string'
  )?.text;

  if (!textBlock) {
    throw new Error('Claude returned no text block');
  }

  let parsed: { topics: ClaudeTopic[] };

  try {
    parsed = JSON.parse(textBlock);
  } catch {
    const cleaned = textBlock
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    parsed = JSON.parse(cleaned);
  }

  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error('Claude response missing topics array');
  }

  return parsed.topics
    .filter(
      (topic) =>
        typeof topic.title === 'string' &&
        typeof topic.content === 'string' &&
        topic.title.trim().length > 0 &&
        topic.content.trim().length > 0
    )
    .map((topic) => ({
      title: topic.title.trim(),
      chapter: topic.chapter?.trim() || null,
      content: topic.content.trim(),
    }));
}

router.post('/', upload.single('pdf'), async (req, res) => {
  let storagePath: string | null = null;
  let textbookId: string | null = null;

  try {
    const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';

    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF uploaded. Use form-data with key "pdf".',
      });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        error: 'Only PDF files are allowed.',
      });
    }

    const sessionId = randomUUID();
    const buffer = req.file.buffer;

    // 1) Extract text from PDF
    const parsedPdf = await (pdfParse as any)(buffer);
    const extractedText = parsedPdf.text?.trim();

    if (!extractedText || extractedText.length < 100) {
      return res.status(400).json({
        error: 'Could not extract enough text from this PDF.',
      });
    }

    // 2) Limit size before sending to Claude
    const maxChars = 120000;
    const textForClaude =
      extractedText.length > maxChars
        ? extractedText.slice(0, maxChars)
        : extractedText;

    // 3) Ask Claude to split into topics
    const topics = await splitTextWithClaude(textForClaude);

    if (topics.length === 0) {
      return res.status(400).json({
        error: 'No chapters or sections could be identified.',
      });
    }

    // 4) Upload original PDF to Supabase Storage
    const safeFilename = sanitizeFilename(req.file.originalname);
    storagePath = `${sessionId}/${safeFilename}`;

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) {
      throw new Error(`Failed to upload PDF to Supabase Storage: ${storageError.message}`);
    }

    // 5) Insert textbook row
    const { data: textbook, error: textbookError } = await supabase
      .from('textbooks')
      .insert({
        session_id: sessionId,
        filename: req.file.originalname,
        storage_path: storagePath,
        page_count: parsedPdf.numpages ?? null,
      })
      .select('id, session_id')
      .single();

    if (textbookError || !textbook) {
      throw new Error(
        `Failed to store textbook record: ${textbookError?.message || 'unknown error'}`
      );
    }

    textbookId = textbook.id;

    // 6) Insert topic rows
    const topicRows = topics.map((topic, index) => ({
      textbook_id: textbook.id,
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

    return res.status(200).json({
      textbookId: textbook.session_id,
      topics: savedTopics ?? [],
    });
  } catch (err) {
    console.error(err);

    // rollback database row if textbook was inserted but later step failed
    if (textbookId) {
      await supabase.from('textbooks').delete().eq('id', textbookId);
    }

    // rollback uploaded file if storage upload succeeded but later step failed
    if (storagePath) {
      const bucket = process.env.SUPABASE_PDF_BUCKET || 'textbooks';
      await supabase.storage.from(bucket).remove([storagePath]);
    }

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
});

export default router;