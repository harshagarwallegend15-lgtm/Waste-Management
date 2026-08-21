-- ========================================================
-- CLEANUP: Remove all dummy data, keep structure
-- Run this in Supabase SQL Editor
-- ========================================================

-- Delete all data in dependency order
DELETE FROM problem_comments;
DELETE FROM society_problems;
DELETE FROM challenge_completions;
DELETE FROM challenges;
DELETE FROM education_content;
DELETE FROM society_scores;
DELETE FROM points_transactions;
DELETE FROM verification_events;
DELETE FROM collection_requests;
DELETE FROM dumping_reports;
DELETE FROM learn_earn_sessions;
DELETE FROM profiles WHERE role != 'admin';

-- Reset points for remaining profiles
UPDATE profiles SET points = 0;
