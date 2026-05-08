import React, { useState } from 'react';
import QobuzImport from './QobuzImport.jsx';

/**
 * Test wrapper for QobuzImport that simulates the import without calling the API
 * Use this in dev to test the import flow without needing actual Qobuz API access
 */
const QobuzImportTest = () => {
  const [testMode, setTestMode] = useState(true);
  const [mockData, setMockData] = useState(null);

  // Mock successful import data
  const mockTracks = [
    {
      id: 'test_1',
      position: 1,
      title: 'Test Track 1',
      artist: 'Test Artist',
      album: 'Test Album',
      year: 2024,
      duration: '3:45',
      spotify_id: 'spotify_test_1',
      apple_id: 'apple_test_1',
      tidal_id: null,
      qobuz_url: 'https://www.qobuz.com/test/track1',
      label: 'Test Label',
      genre: 'Electronic',
      artwork_url: null,
      album_artwork_url: null,
      isrc: 'TEST123456789',
      explicit: false,
      preview_url: null
    },
    {
      id: 'test_2',
      position: 2,
      title: 'Test Track 2',
      artist: 'Test Artist 2',
      album: 'Test Album 2',
      year: 2023,
      duration: '4:12',
      spotify_id: 'spotify_test_2',
      apple_id: null,
      tidal_id: 'tidal_test_2',
      qobuz_url: 'https://www.qobuz.com/test/track2',
      label: 'Test Label 2',
      genre: 'Rock',
      artwork_url: null,
      album_artwork_url: null,
      isrc: 'TEST987654321',
      explicit: true,
      preview_url: null
    }
  ];

  const handleTestImport = () => {
    console.log('[TEST] Simulating Qobuz import...');
    
    // Simulate the onImportSuccess callback with mock data
    setTimeout(() => {
      const mockResult = {
        tracks: mockTracks,
        skipped: [
          {
            title: 'Skipped Track',
            artist: 'Skipped Artist',
            reason: 'Could not match across platforms'
          }
        ],
        summary: {
          total: 3,
          matched: 2,
          successRate: 0.67
        }
      };
      
      setMockData(mockResult);
      console.log('[TEST] Mock import completed:', mockResult);
    }, 2000);
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', border: '1px solid #ccc' }}>
        <h3>Qobuz Import Test Mode</h3>
        <p>This is a test wrapper that simulates the import without calling the API.</p>
        <button 
          onClick={handleTestImport}
          style={{ padding: '10px 20px', marginTop: '10px', cursor: 'pointer' }}
        >
          Simulate Import
        </button>
        {mockData && (
          <div style={{ marginTop: '20px', padding: '10px', background: '#e8f5e9', border: '1px solid #4caf50' }}>
            <h4>Mock Import Result:</h4>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(mockData, null, 2)}
            </pre>
          </div>
        )}
      </div>
      
      <QobuzImport 
        onImportSuccess={(data) => {
          console.log('[TEST] onImportSuccess called with:', data);
          setMockData(data);
          alert('Import success callback triggered! Check console for details.');
        }}
      />
    </div>
  );
};

export default QobuzImportTest;




