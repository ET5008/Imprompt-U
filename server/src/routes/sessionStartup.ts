import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const sessionStartupRouter = Router();

sessionStartupRouter.post('/start', async (req: Request, res: Response) => {
  const { topicId } = req.body as { topicId?: string };

  if (!topicId) {
    res.status(400).json({ error: 'topicId is required' });
    return;
  }

  // Fetch topic content from Supabase
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id, title, content')
    .eq('id', topicId)
    .single();

  if (topicError || !topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  const systemPrompt = `You are a Socratic tutor helping a student master the following topic: "${topic.title}".

Your role is to guide the student to understanding through questions — never lecture or give answers directly.
Ask the student to explain concepts in their own words, probe with follow-ups, present edge cases, and
correct misconceptions gently by asking better questions.

When you are fully confident the student has demonstrated mastery of all key concepts, end your message with the token [MASTERY_REACHED] on its own line.

## Reference Material
The following is the full text of the relevant chapter. Use it as your source of truth.

---
${topic.content}
---`;

  const { data: reviewSession, error: insertError } = await supabase
    .from('review_sessions')
    .insert({
      topic_id: topicId,
      system_prompt: systemPrompt,
      chapter_content: topic.content,
      total_concepts: 0,
      mastery_percent: 0,
      mastery_reached: false,
    })
    .select('id')
    .single();

  if (insertError || !reviewSession) {
    res.status(500).json({ error: 'Failed to create review session' });
    return;
  }

  const recallPrompt = `Before we dive in, take a moment to recall what you already know. In your own words, tell me everything you can remember about **${topic.title}** — don't look anything up, just share what comes to mind.`;

  res.status(201).json({ reviewKey: reviewSession.id, recallPrompt });
});

export default sessionStartupRouter;