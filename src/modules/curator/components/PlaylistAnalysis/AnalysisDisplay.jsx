import styled from 'styled-components';
import { tokens, theme, Button } from '../ui/index.jsx';
import AnalysisSummary from './AnalysisSummary.jsx';
import AnalysisTable from './AnalysisTable.jsx';

const Container = styled.div`
  padding: ${tokens.spacing[4]} 0;
`;

const PlaylistHeader = styled.div`
  display: flex;
  align-items: start;
  gap: ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[6]};
  padding-bottom: ${tokens.spacing[4]};
  border-bottom: 2px dashed ${theme.colors.black};

  img {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border: 2px solid ${theme.colors.black};
  }

  .info {
    flex: 1;

    h3 {
      margin: 0 0 ${tokens.spacing[2]} 0;
      font-size: 1.5rem;
      font-weight: bold;
    }

    p {
      margin: ${tokens.spacing[1]} 0;
      color: ${theme.colors.darkgray};
      font-size: 0.95rem;

      &.owner {
        font-weight: 500;
        color: ${theme.colors.black};
      }
    }

    a {
      color: ${theme.colors.black};
      text-decoration: underline;

      &:hover {
        opacity: 0.7;
      }
    }
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${tokens.spacing[3]};
  margin-bottom: ${tokens.spacing[6]};
`;

const Section = styled.div`
  margin-bottom: ${tokens.spacing[8]};
`;

export default function AnalysisDisplay({ playlistData, tracks, analytics, onNewAnalysis }) {
  return (
    <Container>
      <PlaylistHeader>
        {playlistData.image && (
          <img src={playlistData.image} alt={playlistData.name} />
        )}
        <div className="info">
          <h3>{playlistData.name}</h3>
          {playlistData.owner && <p className="owner">by {playlistData.owner}</p>}
          {playlistData.description && <p>{playlistData.description}</p>}
          <p>{playlistData.total_tracks} tracks</p>
          {playlistData.url && (
            <p>
              <a href={playlistData.url} target="_blank" rel="noopener noreferrer">
                Open in Spotify
              </a>
            </p>
          )}
        </div>
      </PlaylistHeader>

      <ActionsBar>
        <Button $variant="secondary" onClick={onNewAnalysis}>
          ANALYZE ANOTHER
        </Button>
      </ActionsBar>

      <Section>
        <AnalysisSummary analytics={analytics} />
      </Section>

      <Section>
        <AnalysisTable analytics={analytics} tracks={tracks} />
      </Section>
    </Container>
  );
}
