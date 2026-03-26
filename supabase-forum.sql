-- Forum tables for Rendimientos.co
-- Run this in your Supabase SQL Editor

-- Threads table
CREATE TABLE forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  replies_count INTEGER NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replies table
CREATE TABLE forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_forum_threads_category ON forum_threads(category);
CREATE INDEX idx_forum_threads_last_reply ON forum_threads(last_reply_at DESC);
CREATE INDEX idx_forum_replies_thread ON forum_replies(thread_id, created_at);

-- RLS
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "threads_select" ON forum_threads FOR SELECT USING (true);
CREATE POLICY "replies_select" ON forum_replies FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "threads_insert" ON forum_threads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "replies_insert" ON forum_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only author can update/delete
CREATE POLICY "threads_update" ON forum_threads FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "threads_delete" ON forum_threads FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "replies_update" ON forum_replies FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "replies_delete" ON forum_replies FOR DELETE USING (user_id = auth.uid());

-- Trigger: update replies_count and last_reply_at on thread when reply is added/removed
CREATE OR REPLACE FUNCTION update_thread_reply_stats() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads SET
      replies_count = replies_count + 1,
      last_reply_at = NEW.created_at
    WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_threads SET
      replies_count = GREATEST(0, replies_count - 1),
      last_reply_at = COALESCE(
        (SELECT MAX(created_at) FROM forum_replies WHERE thread_id = OLD.thread_id),
        (SELECT created_at FROM forum_threads WHERE id = OLD.thread_id)
      )
    WHERE id = OLD.thread_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_reply_stats
  AFTER INSERT OR DELETE ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION update_thread_reply_stats();
