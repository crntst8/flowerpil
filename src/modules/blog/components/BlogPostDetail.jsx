import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import { getBlogPostBySlug, getImageUrl, formatFullDate } from '../services/blogService';

const BlogPostDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true);
        const data = await getBlogPostBySlug(slug);
        setPost(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching blog post:', err);
        setError(err.message || 'Failed to load blog post');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ContentContainer>
          <LoadingMessage>Loading...</LoadingMessage>
        </ContentContainer>
      </PageContainer>
    );
  }

  if (error || !post) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ContentContainer>
          <ErrorMessage>{error || 'Blog post not found'}</ErrorMessage>
          <BackButton onClick={() => navigate('/home')}>← Back to Home</BackButton>
        </ContentContainer>
      </PageContainer>
    );
  }

  // Check for actual image value (not empty string or whitespace)
  const hasImage = post.featured_image && post.featured_image.trim() !== '';
  const featuredImage = hasImage ? getImageUrl(post.featured_image) : null;
  const publishDate = formatFullDate(post.published_at || post.created_at);

  return (
    <PageContainer>
      <ReusableHeader />

      <ContentContainer>
        <Article>
          {hasImage && featuredImage && (
            <FeaturedImage>
              <img src={featuredImage} alt={post.title} />
            </FeaturedImage>
          )}

          <ArticleHeader>
            <PostMeta>
              <PostDate>{publishDate}</PostDate>
              {post.author_name && <PostAuthor>By {post.author_name}</PostAuthor>}
            </PostMeta>

            <PostTitle>{post.title}</PostTitle>

            {post.excerpt && (
              <PostExcerpt dangerouslySetInnerHTML={{ __html: post.excerpt }} />
            )}
          </ArticleHeader>

          <ArticleContent>
            <ContentBody
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </ArticleContent>

          <ArticleFooter>
            <BackButton onClick={() => navigate('/home')}>← Back to Home</BackButton>
          </ArticleFooter>
        </Article>
      </ContentContainer>
    </PageContainer>
  );
};

export default BlogPostDetail;

// STYLES

const PageContainer = styled.div`
  min-height: 100vh;
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
`;

const ContentContainer = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.layout.containerPadding};
  width: 100%;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.lg} ${theme.layout.containerPadding};
  }
`;

const Article = styled.article`
  background: ${theme.colors.fpwhite};
  text-align: left;
`;

const FeaturedImage = styled.figure`
  margin: 0 0 ${theme.spacing.xl} 0;
  border: ${theme.borders.solid} ${theme.colors.black};
  overflow: hidden;

  img {
    width: 100%;
    height: auto;
    display: block;
  }
`;

const ArticleHeader = styled.header`
  margin-bottom: ${theme.spacing.xxl};
  text-align: left;
  padding-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
`;

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
`;

const PostDate = styled.time`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  opacity: 0.7;
`;

const PostAuthor = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  opacity: 0.7;
`;

const PostTitle = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: ${theme.colors.black};
  margin: 0 0 ${theme.spacing.lg} 0;
  text-align: left;

  ${mediaQuery.mobile} {
    font-size: clamp(2rem, 8vw, 2.5rem);
  }
`;

const PostExcerpt = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 1.25rem;
  font-weight: ${theme.fontWeights.medium};
  line-height: 1.4;
  color: ${theme.colors.black};
  margin: 0;
  opacity: 0.9;
  text-align: left;

  /* Rich text styles for excerpt */
  p {
    margin: 0 0 ${theme.spacing.sm} 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  strong, b {
    font-weight: ${theme.fontWeights.bold};
  }

  em, i {
    font-style: italic;
  }

  ${mediaQuery.mobile} {
    font-size: 1.125rem;
  }
`;

const ArticleContent = styled.div`
  margin-bottom: ${theme.spacing.xxl};
  text-align: left;
`;

const ContentBody = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  line-height: 1.7;
  color: ${theme.colors.black};
  text-align: left;

  /* Blog typography styles */
  p {
    margin: 0 0 1.5em 0;
    text-align: left;
    font-size: 1.125rem; /* ~18px for better readability */
  }

  h2 {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h2};
    font-weight: ${theme.fontWeights.bold};
    margin: 2em 0 0.75em 0;
    color: ${theme.colors.black};
    text-align: left;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  h3 {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
    margin: 1.5em 0 0.5em 0;
    color: ${theme.colors.black};
    text-align: left;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  h4 {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.hx};
    font-weight: ${theme.fontWeights.bold};
    margin: 1.5em 0 0.5em 0;
    color: ${theme.colors.black};
    text-align: left;
  }

  ul, ol {
    margin: 0 0 1.5em 0;
    padding-left: 1.5em;
    text-align: left;
  }

  li {
    margin-bottom: 0.5em;
    line-height: 1.6;
    font-size: 1.125rem;
  }

  blockquote {
    margin: 2em 0;
    padding: 0 0 0 1.5em;
    border-left: 4px solid ${theme.colors.black};
    font-style: italic;
    color: ${theme.colors.black};
    text-align: left;
    background: transparent;
    font-size: 1.25rem;
    line-height: 1.5;

    p {
      margin-bottom: 0.5em;
      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  a {
    color: ${theme.colors.black};
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    transition: opacity ${theme.transitions.fast};

    &:hover {
      opacity: 0.6;
    }
  }

  strong, b {
    font-weight: ${theme.fontWeights.bold};
  }

  em, i {
    font-style: italic;
  }

  img {
    max-width: 100%;
    height: auto;
    margin: 2em 0;
    border-radius: ${theme.radii.sm};
  }

  code {
    font-family: ${theme.fonts.mono};
    font-size: 0.9em;
    background: ${theme.colors.gray[100]};
    padding: 2px 5px;
    border-radius: 3px;
  }

  pre {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    padding: ${theme.spacing.lg};
    border-radius: ${theme.radii.md};
    overflow-x: auto;
    margin: 2em 0;

    code {
      background: none;
      padding: 0;
      color: inherit;
    }
  }

  hr {
    border: none;
    border-top: 1px solid ${theme.colors.gray[300]};
    margin: 3em 0;
  }

  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.body};
    
    p, li {
      font-size: 1rem;
    }
  }
`;

const ArticleFooter = styled.footer`
  margin-top: ${theme.spacing.xxl};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.solid} ${theme.colors.black};
`;

const BackButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  background: transparent;
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
  }
`;

const LoadingMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  text-align: center;
  padding: ${theme.spacing.xxl} 0;
`;

const ErrorMessage = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  text-align: center;
  padding: ${theme.spacing.xl} 0;
`;
