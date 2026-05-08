import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';

const BulkArtworkUpload = ({ playlistId, onUploadComplete }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    setUploadResults(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to upload');
      return;
    }

    if (!playlistId) {
      setError('No playlist selected');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('playlistId', playlistId);
      
      selectedFiles.forEach((file) => {
        formData.append('artwork', file);
      });

      const response = await fetch('/api/v1/artwork/bulk-upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setUploadResults(data.data);
      
      if (onUploadComplete) {
        onUploadComplete(data.data);
      }

      // Clear file selection
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      setError('Failed to upload artwork: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setUploadResults(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearError = () => setError(null);

  return (
    <BulkUploadContainer>
      <Header>
        <h4>Bulk Artwork Upload</h4>
        <p>Upload multiple artwork files with automatic track matching</p>
      </Header>

      <UploadInstructions>
        <h5>Naming Convention</h5>
        <InstructionsList>
          <li><code>Artist - Title.jpg</code> (recommended)</li>
          <li><code>Artist_Title.jpg</code></li>
          <li><code>Artist Title.jpg</code></li>
        </InstructionsList>
        <p>Supported formats: JPEG, PNG, WebP (max 10MB each, 50 files max)</p>
      </UploadInstructions>

      {error && (
        <ErrorMessage>
          {error}
          <Button onClick={clearError} variant="text">×</Button>
        </ErrorMessage>
      )}

      <FileSelection>
        <FileInput
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={isUploading}
        />
        
        <FileSelectButton 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          Select Artwork Files
        </FileSelectButton>

        {selectedFiles.length > 0 && (
          <FileCount>
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </FileCount>
        )}
      </FileSelection>

      {selectedFiles.length > 0 && (
        <SelectedFiles>
          <h5>Selected Files</h5>
          <FileList>
            {selectedFiles.map((file, index) => (
              <FileItem key={index}>
                <FileName>{file.name}</FileName>
                <FileSize>{(file.size / 1024 / 1024).toFixed(2)} MB</FileSize>
              </FileItem>
            ))}
          </FileList>
        </SelectedFiles>
      )}

      <UploadActions>
        <Button
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || isUploading || !playlistId}
          variant="primary"
        >
          {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} Files`}
        </Button>

        {selectedFiles.length > 0 && (
          <Button onClick={clearFiles} disabled={isUploading}>
            Clear Selection
          </Button>
        )}
      </UploadActions>

      {uploadResults && (
        <UploadResults>
          <ResultsHeader>
            <h5>Upload Results</h5>
            <ResultsSummary>
              {uploadResults.summary.successful} successful, {uploadResults.summary.failed} failed
            </ResultsSummary>
          </ResultsHeader>

          <ResultsList>
            {uploadResults.results.map((result, index) => (
              <ResultItem key={index} success={result.matched}>
                <ResultIcon>{result.matched ? '✓' : '✗'}</ResultIcon>
                <ResultDetails>
                  <ResultFilename>{result.filename}</ResultFilename>
                  {result.matched ? (
                    <ResultMatch>
                      Matched: {result.track.artist} - {result.track.title}
                    </ResultMatch>
                  ) : (
                    <ResultError>
                      {result.reason || result.error || 'No match found'}
                      {result.parsed && (
                        <ParsedInfo>
                          Parsed as: "{result.parsed.artist}" - "{result.parsed.title}"
                        </ParsedInfo>
                      )}
                    </ResultError>
                  )}
                </ResultDetails>
              </ResultItem>
            ))}
          </ResultsList>
        </UploadResults>
      )}
    </BulkUploadContainer>
  );
};

// Styled Components
const BulkUploadContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.lg};
`;

const Header = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h4 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: ${theme.spacing.xs};
  }
  
  p {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[600]};
  }
`;

const UploadInstructions = styled.div`
  padding: ${theme.spacing.md};
  background: ${theme.colors.gray[50]};
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  margin-bottom: ${theme.spacing.lg};
  
  h5 {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    text-transform: uppercase;
    margin-bottom: ${theme.spacing.sm};
  }
  
  p {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[600]};
    margin-top: ${theme.spacing.sm};
  }
`;

const InstructionsList = styled.ul`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin: ${theme.spacing.sm} 0;
  padding-left: ${theme.spacing.lg};
  
  li {
    margin-bottom: ${theme.spacing.xs};
  }
  
  code {
    background: ${theme.colors.gray[100]};
    padding: 2px 4px;
    border-radius: 2px;
  }
`;

const ErrorMessage = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(220, 38, 127, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.red};
  color: ${theme.colors.red};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const FileSelection = styled.div`
  margin-bottom: ${theme.spacing.lg};
`;

const FileInput = styled.input`
  display: none;
`;

const FileSelectButton = styled(Button)`
  margin-bottom: ${theme.spacing.sm};
`;

const FileCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
`;

const SelectedFiles = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h5 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: ${theme.spacing.md};
  }
`;

const FileList = styled.div`
  max-height: 200px;
  overflow-y: auto;
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: ${theme.colors.gray[50]};
`;

const FileItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[200]};
  
  &:last-child {
    border-bottom: none;
  }
`;

const FileName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSize = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin-left: ${theme.spacing.md};
`;

const UploadActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
`;

const UploadResults = styled.div`
  border-top: ${theme.borders.dashed} ${theme.colors.gray[200]};
  padding-top: ${theme.spacing.lg};
`;

const ResultsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.md};
  
  h5 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const ResultsSummary = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
`;

const ResultsList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
`;

const ResultItem = styled.div`
  display: flex;
  align-items: start;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: ${props => props.success ? 'rgba(76, 175, 80, 0.05)' : 'rgba(220, 38, 127, 0.05)'};
  
  &:last-child {
    border-bottom: none;
  }
`;

const ResultIcon = styled.div`
  font-family: ${theme.fonts.mono};
  font-weight: ${theme.fontWeights.bold};
  color: ${props => props.children === '✓' ? theme.colors.success : theme.colors.red};
`;

const ResultDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const ResultFilename = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  margin-bottom: ${theme.spacing.xs};
`;

const ResultMatch = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.success};
`;

const ResultError = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.red};
`;

const ParsedInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  margin-top: ${theme.spacing.xs};
`;

export default BulkArtworkUpload;