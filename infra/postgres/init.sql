-- Create Databases
CREATE DATABASE user_db;
CREATE DATABASE content_db;
CREATE DATABASE moderation_db;

-- Connect to user_db and create users and notifications tables
\c user_db;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  public_username VARCHAR(100) UNIQUE,
  anonymous_username VARCHAR(100) UNIQUE,
  score INTEGER DEFAULT 0,
  title VARCHAR(50) DEFAULT 'Sewak',
  phone_hash VARCHAR(64) UNIQUE,
  two_fa_enabled BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'score_update', 'rank_up', 'admin_review', 'geofence'
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connect to content_db and create submissions and disputes tables
\c content_db;

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  author_id VARCHAR(50) NOT NULL,
  profile_type VARCHAR(20) DEFAULT 'public', -- 'public' or 'anonymous'
  media_url TEXT,
  media_type VARCHAR(20), -- 'image', 'video', 'audio'
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  constituency VARCHAR(100),
  state VARCHAR(100),
  exif_metadata JSONB,
  questions JSONB, -- list of questions from submittee
  open_debate BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'Under Review', -- 'Under Review', 'Accepted', 'Rejected'
  rejection_reason TEXT,
  clubbed_with_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clubbing_disputes (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Resolved'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connect to moderation_db and create votes, reports, and surveys tables
\c moderation_db;

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  voter_id VARCHAR(50) NOT NULL,
  profile_type VARCHAR(20) DEFAULT 'public', -- 'public' or 'anonymous'
  vote_value INTEGER NOT NULL, -- 1 for upvote, -1 for downvote
  comment TEXT NOT NULL, -- mandatory constructive comment
  moderation_status VARCHAR(50) DEFAULT 'approved', -- 'approved', 'flagged'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_vote_user_submission UNIQUE (submission_id, voter_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id VARCHAR(50) NOT NULL,
  content_type VARCHAR(20) NOT NULL, -- 'post', 'comment', 'user', 'debate'
  content_id VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  screenshot_url TEXT,
  status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Resolved'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveys (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  options JSONB NOT NULL, -- array of survey choices
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_votes (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,
  option_selected VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_survey_vote UNIQUE (survey_id, user_id)
);
