#!/usr/bin/env node
/**
 * Script to create/update the "Post" content tag and assign it to all blog posts
 *
 * This script ensures that:
 * 1. The "Post" content tag exists with correct styling (#78862C background, black text)
 * 2. All blog posts are assigned this tag
 *
 * Usage: node scripts/setup-post-content-tag.js
 */

import { getDatabase } from '../server/database/db.js';

const POST_TAG_CONFIG = {
  text: 'Post',
  color: '#78862C',
  text_color: '#000000',
  url_slug: 'posts',
  description: 'Blog posts and articles',
  allow_self_assign: 0
};

const setupPostContentTag = () => {
  const db = getDatabase();

  console.log('🔄 Setting up Post content tag...\n');

  try {
    db.exec('BEGIN TRANSACTION');

    // Check if the tag exists
    const existingTag = db.prepare(`
      SELECT * FROM custom_playlist_flags WHERE url_slug = ?
    `).get(POST_TAG_CONFIG.url_slug);

    let tagId;

    if (existingTag) {
      console.log(`✅ Found existing tag with id ${existingTag.id}`);
      console.log(`   Current: text="${existingTag.text}", color="${existingTag.color}", text_color="${existingTag.text_color}"`);

      // Update the existing tag with new values
      console.log(`🔄 Updating tag to new values...`);
      db.prepare(`
        UPDATE custom_playlist_flags
        SET text = ?,
            color = ?,
            text_color = ?,
            description = ?,
            allow_self_assign = ?
        WHERE id = ?
      `).run(
        POST_TAG_CONFIG.text,
        POST_TAG_CONFIG.color,
        POST_TAG_CONFIG.text_color,
        POST_TAG_CONFIG.description,
        POST_TAG_CONFIG.allow_self_assign,
        existingTag.id
      );

      tagId = existingTag.id;
      console.log(`✅ Updated tag successfully`);
    } else {
      // Create new tag
      console.log(`📝 Creating new "Post" tag...`);
      const result = db.prepare(`
        INSERT INTO custom_playlist_flags (text, color, text_color, url_slug, description, allow_self_assign)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        POST_TAG_CONFIG.text,
        POST_TAG_CONFIG.color,
        POST_TAG_CONFIG.text_color,
        POST_TAG_CONFIG.url_slug,
        POST_TAG_CONFIG.description,
        POST_TAG_CONFIG.allow_self_assign
      );

      tagId = result.lastInsertRowid;
      console.log(`✅ Created tag with id ${tagId}`);
    }

    console.log(`   Final: text="${POST_TAG_CONFIG.text}", color="${POST_TAG_CONFIG.color}", text_color="${POST_TAG_CONFIG.text_color}"\n`);

    // Get all blog posts
    const blogPosts = db.prepare('SELECT id, title FROM blog_posts').all();
    console.log(`📊 Found ${blogPosts.length} blog post(s)\n`);

    if (blogPosts.length > 0) {
      console.log(`🔄 Assigning "Post" tag to all blog posts...`);

      // Assign tag to all posts (INSERT OR IGNORE to avoid duplicates)
      const assignStmt = db.prepare(`
        INSERT OR IGNORE INTO blog_post_flag_assignments (post_id, flag_id)
        VALUES (?, ?)
      `);

      let assigned = 0;
      for (const post of blogPosts) {
        const result = assignStmt.run(post.id, tagId);
        if (result.changes > 0) {
          assigned++;
          console.log(`   ✓ Assigned to: "${post.title}" (id: ${post.id})`);
        } else {
          console.log(`   ⊝ Already assigned: "${post.title}" (id: ${post.id})`);
        }
      }

      console.log(`\n✅ Successfully assigned tag to ${assigned} new post(s)`);
      console.log(`   Total assignments verified: ${blogPosts.length}`);
    } else {
      console.log(`ℹ️  No blog posts found - tag ready for future posts`);
    }

    db.exec('COMMIT');

    // Verify the setup
    console.log('\n📋 Verification:');
    const tag = db.prepare('SELECT * FROM custom_playlist_flags WHERE id = ?').get(tagId);
    console.log(`   Tag: "${tag.text}" (${tag.color} bg, ${tag.text_color} text)`);
    console.log(`   URL: /content-tag/${tag.url_slug}`);

    const assignmentCount = db.prepare(`
      SELECT COUNT(*) as count FROM blog_post_flag_assignments WHERE flag_id = ?
    `).get(tagId);
    console.log(`   Assignments: ${assignmentCount.count} blog post(s)`);

    console.log('\n✅ Setup complete!\n');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('\n❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

// Run the setup
setupPostContentTag();
