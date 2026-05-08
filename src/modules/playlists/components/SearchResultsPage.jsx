import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import { useFullSearch } from '@core/hooks/useSearch';
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup, parseGenreTags } from '@shared/utils/genreUtils';
import SEO from '@shared/components/SEO';

const MATCH_LABELS = {
  artist: 'Matched artist',
  genre_tag: 'Matched genre tag',
  genre_track: 'Matched genre',
  track_title: 'Matched track',
  playlist_title: 'Matched title',
  recent: 'Recently updated'
};

const SearchResultsPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { results, loading, error } = useFullSearch({
    query,
    limit: 20,
    offset: 0
  });

  const { catalog: genreCatalog } = useGenreCatalog();
  const genreLookup = useMemo(() => createGenreLookup(genreCatalog), [genreCatalog]);

  const playlistResults = results.results || [];
  const curatorGroup = (results.secondary_groups || []).find(g => g.type === 'curators');
  const curatorResults = curatorGroup?.items || [];
  const pagination = results.pagination || {};

  if (!query) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ContentWrapper>
          <EmptyMessage>Enter a search term to find playlists.</EmptyMessage>
        </ContentWrapper>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SEO
        title={`Search: ${query}`}
        description={`Search results for "${query}" on Flowerpil`}
      />
      <ReusableHeader />
      <ContentWrapper>
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / Search
        </PageBreadcrumb>

        <QueryHeading>
          Results for <QueryText>{query}</QueryText>
        </QueryHeading>

        {loading && (
          <EmptyMessage>Searching...</EmptyMessage>
        )}

        {!loading && error && (
          <EmptyMessage>Search unavailable. Please try again.</EmptyMessage>
        )}

        {!loading && !error && playlistResults.length === 0 && (
          <EmptyMessage>No results found for "{query}"</EmptyMessage>
        )}

        {!loading && !error && playlistResults.length > 0 && (
          <ResultsSection>
            <SectionLabel>Playlists</SectionLabel>
            <ResultsList>
              {playlistResults.map((item) => {
                const tags = parseGenreTags(item.tags);
                const resolvedTags = tags.map(tag => {
                  const match = genreLookup?.resolve?.(tag);
                  return {
                    label: match?.label || tag,
                    color: match?.color || '#000'
                  };
                }).slice(0, 4);

                const matchReasons = (item.match_reasons || [])
                  .map(r => MATCH_LABELS[r] || r)
                  .join(', ');

                const publishDate = item.publish_date || item.published_at;
                const dateLabel = publishDate ? new Date(publishDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase() : null;

                return (
                  <ResultCard key={item.id} to={`/playlist/${item.id}`}>
                    <ResultContent>
                      <TypeDate>
                        PLAYLIST{dateLabel ? ` / ${dateLabel}` : ''}
                      </TypeDate>
                      <ResultMeta>
                        {item.curator && <CuratorName>{item.curator}</CuratorName>}
                      </ResultMeta>
                      <ResultTitle>{item.title}</ResultTitle>
                      {resolvedTags.length > 0 && (
                        <TagRow>
                          {resolvedTags.map((tag, i) => (
                            <GenreTag key={i} $color={tag.color}>{tag.label}</GenreTag>
                          ))}
                        </TagRow>
                      )}
                      {matchReasons && (
                        <MatchReason>{matchReasons}</MatchReason>
                      )}
                    </ResultContent>
                  </ResultCard>
                );
              })}
            </ResultsList>
            {pagination.total > 0 && (
              <ResultCount>{pagination.total} result{pagination.total !== 1 ? 's' : ''}</ResultCount>
            )}
          </ResultsSection>
        )}

        {!loading && curatorResults.length > 0 && (
          <ResultsSection>
            <SectionLabel>Curators</SectionLabel>
            <ResultsList>
              {curatorResults.map((curator) => (
                <ResultCard
                  key={curator.curator_id}
                  to={`/curator/${encodeURIComponent(curator.name)}`}
                >
                  <ResultContent>
                    <TypeDate>CURATOR</TypeDate>
                    <ResultMeta>
                      {curator.profile_type && (
                        <CuratorName>{curator.profile_type}</CuratorName>
                      )}
                    </ResultMeta>
                    <ResultTitle>{curator.name}</ResultTitle>
                    {curator.playlist_count > 0 && (
                      <MatchReason>
                        {curator.playlist_count} playlist{curator.playlist_count !== 1 ? 's' : ''}
                      </MatchReason>
                    )}
                  </ResultContent>
                </ResultCard>
              ))}
            </ResultsList>
          </ResultsSection>
        )}
      </ContentWrapper>
    </PageContainer>
  );
};

const PageContainer = styled.div`
  min-height: calc(var(--vh, 1vh) * 100);
  width: 100%;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  display: flex;
  flex-direction: column;
`;

const ContentWrapper = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  padding: ${theme.spacing.lg} ${theme.layout.containerPadding} ${theme.spacing.xl};
  width: 100%;
`;

const PageBreadcrumb = styled.nav`
  font-family: ${theme.fonts.mono};
  font-size: 0.75rem;
  letter-spacing: 0.03em;
  color: ${theme.colors.textSecondary};
  margin-bottom: ${theme.spacing.md};

  a {
    color: ${theme.colors.textSecondary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const QueryHeading = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.5px;
  margin-bottom: ${theme.spacing.lg};
`;

const QueryText = styled.span`
  font-style: italic;
`;

const EmptyMessage = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: 1rem;
  color: ${theme.colors.textSecondary};
  padding: ${theme.spacing.xl} 0;
`;

const ResultsSection = styled.section`
  margin-bottom: ${theme.spacing.xl};
`;

const SectionLabel = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.textSecondary};
  margin-bottom: ${theme.spacing.sm};
`;

const ResultsList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ResultCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md} ${theme.spacing.sm};
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  transition: background ${theme.transitions.fast};

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const ResultContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
`;

const TypeDate = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: ${theme.colors.textSecondary};
  text-transform: uppercase;
`;

const ResultMeta = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 0.8rem;
  color: ${theme.colors.textSecondary};
`;

const CuratorName = styled.span`
  letter-spacing: -0.2px;
`;

const ResultTitle = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: 1.15rem;
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.5px;
`;

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
`;

const GenreTag = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border: 1px solid ${props => props.$color};
  color: ${props => props.$color};
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.5rem, 1.2vw, 0.7rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 0;
  background: transparent;
`;

const MatchReason = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 0.7rem;
  color: ${theme.colors.textSecondary};
  letter-spacing: 0.02em;
`;

const ResultCount = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: 0.75rem;
  color: ${theme.colors.textSecondary};
  margin-top: ${theme.spacing.sm};
`;

export default SearchResultsPage;
