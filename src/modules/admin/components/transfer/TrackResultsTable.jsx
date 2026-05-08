import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const Wrapper = styled.div`
  margin-top: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const Controls = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const FilterButton = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  padding: 6px 10px;
  border-radius: 999px;
  border: ${theme.borders.solidThin} ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.2)')};
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.06)' : 'transparent')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
`;

const Search = styled.input`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.16);
  min-width: 220px;
`;

const Table = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  overflow: hidden;
`;

const HeaderRow = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  background: rgba(0, 0, 0, 0.04);
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  padding: ${theme.spacing.sm};
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);
  background: ${({ $striped }) => ($striped ? 'rgba(0, 0, 0, 0.02)' : 'transparent')};
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ${theme.fonts.Primary};
  font-size: ${theme.fontSizes.small};
  word-break: break-word;
`;

const Sub = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const Pill = styled.span`
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  background: ${({ $variant }) => ({
    success: 'rgba(14, 159, 110, 0.14)',
    warn: 'rgba(226, 180, 74, 0.16)',
    error: 'rgba(226, 74, 91, 0.14)'
  }[$variant] || 'rgba(0,0,0,0.06)')};
  color: ${({ $variant }) => ({
    success: '#0f7b5f',
    error: '#a52727',
    warn: '#8a5a00'
  }[$variant] || 'rgba(0,0,0,0.78)')};
`;

const formatStatus = (result) => {
  if (!result) return { label: '—', variant: 'warn' };
  if (result.matched) return { label: `Matched (${result.confidence || 0}%)`, variant: 'success' };
  return { label: 'No match', variant: 'error' };
};

const TrackResultsTable = ({ tracks = [] }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tracks.filter((track) => {
      const appleMatch = track.apple?.matched;
      const tidalMatch = track.tidal?.matched;
      if (filter === 'matched' && !(appleMatch || tidalMatch)) return false;
      if (filter === 'failed' && (appleMatch || tidalMatch)) return false;
      if (term) {
        const haystack = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [tracks, filter, search]);

  return (
    <Wrapper>
      <Controls>
        <FilterButton type="button" $active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
        <FilterButton type="button" $active={filter === 'matched'} onClick={() => setFilter('matched')}>Matched</FilterButton>
        <FilterButton type="button" $active={filter === 'failed'} onClick={() => setFilter('failed')}>Failed</FilterButton>
        <Search
          placeholder="Search tracks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Controls>

      <Table>
        <HeaderRow>
          <div>Track</div>
          <div>Spotify ISRC</div>
          <div>Apple Music</div>
          <div>TIDAL</div>
        </HeaderRow>
        {filtered.map((track, idx) => {
          const appleStatus = formatStatus(track.apple);
          const tidalStatus = formatStatus(track.tidal);
          return (
            <Row key={`${track.spotify_id || idx}-${idx}`} $striped={idx % 2 === 1}>
              <Cell>
                <strong>{track.title || 'Untitled'}</strong>
                <Sub>{track.artist}</Sub>
              </Cell>
              <Cell>
                <Sub>{track.isrc || '—'}</Sub>
                <Sub>{track.spotify_id || ''}</Sub>
              </Cell>
              <Cell>
                <Pill $variant={appleStatus.variant}>{appleStatus.label}</Pill>
                {track.apple?.url && <Sub><a href={track.apple.url} target="_blank" rel="noreferrer">Open</a></Sub>}
                {track.apple?.strategy && <Sub>via {track.apple.strategy}</Sub>}
              </Cell>
              <Cell>
                <Pill $variant={tidalStatus.variant}>{tidalStatus.label}</Pill>
                {track.tidal?.url && <Sub><a href={track.tidal.url} target="_blank" rel="noreferrer">Open</a></Sub>}
                {track.tidal?.strategy && <Sub>via {track.tidal.strategy}</Sub>}
              </Cell>
            </Row>
          );
        })}
        {filtered.length === 0 && (
          <Row>
            <Cell>No tracks match the current filter.</Cell>
          </Row>
        )}
      </Table>
    </Wrapper>
  );
};

export default TrackResultsTable;
