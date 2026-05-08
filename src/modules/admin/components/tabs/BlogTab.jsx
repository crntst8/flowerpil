import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { getAllBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost } from '@modules/blog/services/blogService';
import RichTextEditor from '@modules/curator/components/RichTextEditor';

const BlogTab = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    excerpt: '',
    content: '',
    published: false,
    featured_on_homepage: true
  });
  const [imageFile, setImageFile] = useState(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllBlogPosts();
      setPosts(data);
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const formDataObj = new FormData();
      formDataObj.append('title', formData.title);
      formDataObj.append('excerpt', formData.excerpt || '');
      formDataObj.append('content', formData.content || '');
      formDataObj.append('published', formData.published);
      formDataObj.append('featured_on_homepage', formData.featured_on_homepage);

      if (imageFile) {
        formDataObj.append('featured_image', imageFile);
      }

      if (editingPost) {
        await updateBlogPost(editingPost.id, formDataObj);
      } else {
        await createBlogPost(formDataObj);
      }

      setShowEditor(false);
      setEditingPost(null);
      setFormData({
        title: '',
        excerpt: '',
        content: '',
        published: false,
        featured_on_homepage: true
      });
      setImageFile(null);
      fetchPosts();
    } catch (error) {
      console.error('Error saving blog post:', error);
      alert('Failed to save blog post');
    }
  };

  const handleEdit = (post) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      excerpt: post.excerpt || '',
      content: post.content || '',
      published: post.published === 1,
      featured_on_homepage: post.featured_on_homepage === 1
    });
    setImageFile(null);
    setShowEditor(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      await deleteBlogPost(id);
      fetchPosts();
    } catch (error) {
      console.error('Error deleting blog post:', error);
      alert('Failed to delete blog post');
    }
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingPost(null);
    setFormData({
      title: '',
      excerpt: '',
      content: '',
      published: false,
      featured_on_homepage: true
    });
    setImageFile(null);
  };

  return (
    <TabWrapper>
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Blog Posts</SectionTitle>
            <MetaText>{posts.length} total posts</MetaText>
          </HeadingGroup>
          <HeaderActions>
            {!showEditor && (
              <Button onClick={() => setShowEditor(true)}>
                + New Post
              </Button>
            )}
          </HeaderActions>
        </HeaderRow>

        {showEditor && (
          <EditorSection>
            <EditorTitle>{editingPost ? 'Edit Post' : 'New Post'}</EditorTitle>
            <Form onSubmit={handleSubmit}>
              <FormField>
                <Label>Title *</Label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </FormField>

              <FormField>
                <Label>Excerpt</Label>
                <RichTextEditor
                  value={formData.excerpt}
                  onChange={(value) => setFormData({ ...formData, excerpt: value })}
                  placeholder="Short description for the card..."
                />
              </FormField>

              <FormField>
                <Label>Content</Label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  placeholder="Main blog post content..."
                />
              </FormField>

              <FormField>
                <Label>Featured Image</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files[0])}
                />
                {editingPost?.featured_image && !imageFile && (
                  <ImagePreview src={`https://images.flowerpil.io/${editingPost.featured_image.replace('/uploads/', '')}`} alt="Current" />
                )}
              </FormField>

              <CheckboxField>
                <Checkbox
                  type="checkbox"
                  checked={formData.published}
                  onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                />
                <Label>Published</Label>
              </CheckboxField>

              <CheckboxField>
                <Checkbox
                  type="checkbox"
                  checked={formData.featured_on_homepage}
                  onChange={(e) => setFormData({ ...formData, featured_on_homepage: e.target.checked })}
                />
                <Label>Show on Homepage</Label>
              </CheckboxField>

              <FormActions>
                <Button type="submit">
                  {editingPost ? 'Update Post' : 'Create Post'}
                </Button>
                <Button type="button" onClick={handleCancel} style={{ background: theme.colors.gray[300] }}>
                  Cancel
                </Button>
              </FormActions>
            </Form>
          </EditorSection>
        )}

        {loading ? (
          <LoadingText>Loading...</LoadingText>
        ) : (
          <PostsList>
            {posts.map((post) => (
              <PostItem key={post.id}>
                <PostInfo>
                  <PostTitle>{post.title}</PostTitle>
                  <PostMeta>
                    {post.published ? (
                      <StatusBadge $published>Published</StatusBadge>
                    ) : (
                      <StatusBadge>Draft</StatusBadge>
                    )}
                    <PostDate>{new Date(post.created_at).toLocaleDateString()}</PostDate>
                    {post.author_name && <span>by {post.author_name}</span>}
                  </PostMeta>
                </PostInfo>
                <PostActions>
                  <ActionButton onClick={() => handleEdit(post)}>Edit</ActionButton>
                  <ActionButton $danger onClick={() => handleDelete(post.id)}>Delete</ActionButton>
                </PostActions>
              </PostItem>
            ))}
            {posts.length === 0 && !loading && (
              <EmptyState>No blog posts yet. Create your first post!</EmptyState>
            )}
          </PostsList>
        )}
      </SurfaceCard>
    </TabWrapper>
  );
};

export default BlogTab;

// STYLES

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: clamp(${theme.spacing.sm}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const HeadingGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.Primary};
  text-transform: uppercase;
  letter-spacing: -0.9px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const EditorSection = styled.div`
  margin-top: ${theme.spacing.lg};
  padding: ${theme.spacing.lg};
  border: ${theme.borders.solid} ${theme.colors.gray[200]};
  border-radius: 8px;
  background: ${theme.colors.gray[50]};
`;

const EditorTitle = styled.h3`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${theme.colors.gray[300]};
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const TextArea = styled.textarea`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${theme.colors.gray[300]};
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const CheckboxField = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const FormActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.md};
`;

const ImagePreview = styled.img`
  max-width: 200px;
  max-height: 150px;
  border: ${theme.borders.solid} ${theme.colors.gray[300]};
  margin-top: ${theme.spacing.xs};
`;

const PostsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.lg};
`;

const PostItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  border: ${theme.borders.solid} ${theme.colors.gray[200]};
  border-radius: 8px;
  background: ${theme.colors.fpwhite};

  &:hover {
    background: ${theme.colors.gray[50]};
  }
`;

const PostInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  flex: 1;
`;

const PostTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
`;

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
`;

const StatusBadge = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: ${theme.fontSizes.xsmall};
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  background: ${props => props.$published ? theme.colors.black : theme.colors.gray[300]};
  color: ${props => props.$published ? theme.colors.fpwhite : theme.colors.gray[700]};
`;

const PostDate = styled.span``;

const PostActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const ActionButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solid} ${props => props.$danger ? '#dc2626' : theme.colors.black};
  background: transparent;
  color: ${props => props.$danger ? '#dc2626' : theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  border-radius: 4px;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${props => props.$danger ? '#dc2626' : theme.colors.black};
    color: ${theme.colors.fpwhite};
  }
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.gray[600]};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  font-family: ${theme.fonts.primary};
  color: ${theme.colors.gray[600]};
`;
